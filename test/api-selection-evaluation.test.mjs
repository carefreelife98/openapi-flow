import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { URL } from 'node:url';
import process from 'node:process';
import { AIMessage } from '@langchain/core/messages';
import { prepareApiSelectionEvaluation } from '../examples/langgraph-workflow/dist/evaluation/selection/prepare-api-selection-evaluation.js';
import { scoreApiSelection } from '../examples/langgraph-workflow/dist/evaluation/selection/score-api-selection.js';
import { SelectionEvaluationObserver } from '../examples/langgraph-workflow/dist/evaluation/selection/selection-evaluation-observer.js';
import { runApiSelectionEvaluation } from '../examples/langgraph-workflow/dist/evaluation/selection/run-api-selection-evaluation.js';

const runProcess = promisify(execFile);
const cliPath = new URL(
  '../examples/langgraph-workflow/dist/cli/evaluate-api-selection.js',
  import.meta.url,
).pathname;

const spec = {
  openapi: '3.1.0',
  info: { title: 'Selection fixture', version: '1' },
  paths: {
    '/items': { get: { responses: { 200: { description: 'Items' } } } },
  },
};
const op = (documentId) => ({
  documentId,
  operationRef: '#/paths/~1items/get',
});
const expectedCase = {
  id: 'case',
  cohort: 'holdout',
  scenario: 'Read both documents',
  expectedOperations: [op('a'), op('b')],
  expectedGap: false,
};
const selection = (ops, gap = false) => ({
  operations: ops.map((key) => ({
    key: { ...key, snapshotId: 'snapshot' },
    purpose: 'Read',
  })),
  gaps: gap
    ? [{ kind: 'missing_operation', description: 'Missing capability' }]
    : [],
});

async function withDataset(action, edit = () => {}) {
  const directory = await mkdtemp(
    join(tmpdir(), 'openapi-flow-selection-eval-'),
  );
  try {
    const bytes = JSON.stringify(spec);
    await writeFile(join(directory, 'oas.json'), bytes);
    const dataset = {
      version: 2,
      repeats: 3,
      sources: ['a', 'b'].map((id) => ({
        id,
        specFile: 'oas.json',
        sha256: createHash('sha256').update(bytes).digest('hex'),
      })),
      cases: [globalThis.structuredClone(expectedCase)],
    };
    edit(dataset);
    const path = join(directory, 'dataset.json');
    await writeFile(path, JSON.stringify(dataset));
    await action(path, directory);
  } finally {
    await rm(directory, { recursive: true });
  }
}

test('selection scores document identities separately and ignores only ordering', () => {
  assert.equal(
    scoreApiSelection(expectedCase, selection([op('b'), op('a')])).exact,
    true,
  );
  const wrong = scoreApiSelection(expectedCase, selection([op('a'), op('a')]));
  assert.equal(wrong.matched, 1);
  assert.equal(wrong.exact, false);
});
test('selection scores repeated call instances rather than deduplicating an API', () => {
  const entry = { ...expectedCase, expectedOperations: [op('a'), op('a')] };
  assert.equal(scoreApiSelection(entry, selection([op('a')])).exact, false);
  assert.equal(
    scoreApiSelection(entry, selection([op('a'), op('a')])).exact,
    true,
  );
  assert.equal(
    scoreApiSelection(entry, selection([op('a'), op('a'), op('a')])).exact,
    false,
  );
});
test('API gap presence and accepted gap-only plans are measured explicitly', () => {
  const entry = { ...expectedCase, expectedOperations: [], expectedGap: true };
  assert.equal(scoreApiSelection(entry, selection([], true)).exact, true);
  assert.equal(scoreApiSelection(entry, null).exact, false);
  assert.equal(
    scoreApiSelection(
      expectedCase,
      selection(expectedCase.expectedOperations, true),
    ).exact,
    false,
  );
});
test('preparation freezes raw OAS bytes and validates answers in a multi-document catalog', async () => {
  await withDataset(async (path) => {
    const prepared = await prepareApiSelectionEvaluation(path);
    assert.equal(prepared.operations.length, 2);
    assert.equal(prepared.documents.length, 2);
    assert.equal(prepared.datasetSha256.length, 64);
  });
});
test('the public example dataset validates without a model or credentials', async () => {
  const datasetPath = new URL(
    '../examples/langgraph-workflow/evaluation/api-selection.dataset.json',
    import.meta.url,
  ).pathname;
  const result = await runProcess(
    process.execPath,
    [cliPath, '--validate-only'],
    {
      env: { OPENAPI_FLOW_EVAL_CASES: datasetPath },
    },
  );
  const validated = JSON.parse(result.stdout);
  assert.equal(validated.valid, true);
  assert.equal(validated.cases, 4);
  assert.equal(validated.repeats, 3);
  assert.deepEqual(
    validated.documents.map((document) => document.operations),
    [3, 3],
  );
});
test('the CLI rejects unknown arguments without calling a model', async () => {
  await assert.rejects(
    runProcess(process.execPath, [cliPath, '--repair'], { env: {} }),
    (error) =>
      error.code === 1 &&
      error.stderr.includes('Only --validate-only is supported'),
  );
});
test('the CLI rejects an existing output file before model construction', async () => {
  await withDataset(async (path, directory) => {
    const outputPath = join(directory, 'report.json');
    await writeFile(outputPath, '{}');
    await assert.rejects(
      runProcess(process.execPath, [cliPath], {
        env: {
          OPENAPI_FLOW_EVAL_CASES: path,
          OPENAPI_FLOW_EVAL_OUTPUT: outputPath,
        },
      }),
      (error) =>
        error.code === 1 &&
        error.stderr.includes('OPENAPI_FLOW_EVAL_OUTPUT already exists'),
    );
  });
});
for (const mutation of [
  'hash',
  'duplicate-source',
  'duplicate-case',
  'unknown-operation',
  'empty-answer',
]) {
  test(`dataset ${mutation} fails before a model can be called`, async () => {
    await withDataset(
      async (path) => assert.rejects(prepareApiSelectionEvaluation(path)),
      (dataset) => {
        if (mutation === 'hash') dataset.sources[0].sha256 = '0'.repeat(64);
        if (mutation === 'duplicate-source') dataset.sources[1].id = 'a';
        if (mutation === 'duplicate-case') dataset.cases.push(dataset.cases[0]);
        if (mutation === 'unknown-operation')
          dataset.cases[0].expectedOperations = [op('unknown')];
        if (mutation === 'empty-answer')
          dataset.cases[0].expectedOperations = [];
      },
    );
  });
}

function scriptedModel(observer, outputs) {
  let calls = 0;
  return {
    calls: () => calls,
    withStructuredOutput(schema, options) {
      assert.equal(options.name, 'select_api_operations');
      return {
        async invoke(messages) {
          calls += 1;
          const input = JSON.parse(messages[1].content);
          assert.deepEqual(Object.keys(input).sort(), [
            'candidates',
            'scenario',
          ]);
          assert.equal(input.expectedOperations, undefined);
          observer.handleLLMStart();
          const output = outputs(calls, input);
          if (output instanceof Error) throw output;
          observer.handleLLMEnd({
            generations: [
              [
                {
                  text: JSON.stringify(output),
                  message: new AIMessage({
                    content: JSON.stringify(output),
                    usage_metadata: {
                      input_tokens: 12,
                      output_tokens: 4,
                      total_tokens: 16,
                    },
                  }),
                },
              ],
            ],
          });
          return schema.parse(output);
        },
      };
    },
  };
}

test('public multi-selection is repeated with no answer hints or repairs and reports separate cohort denominators', async () => {
  await withDataset(async (path) => {
    const observer = new SelectionEvaluationObserver();
    const model = scriptedModel(observer, (n, input) => ({
      operations: input.candidates
        .slice(0, n === 2 ? 1 : 2)
        .map((candidate) => ({
          candidateId: candidate.candidateId,
          purpose: 'Read',
        })),
      gaps: [],
    }));
    const report = await runApiSelectionEvaluation({
      prepared: await prepareApiSelectionEvaluation(path),
      model,
      modelLabel: 'scripted-test-not-quality',
      observer,
    });
    assert.equal(model.calls(), 3);
    assert.equal(report.complete, true);
    assert.deepEqual(report.summary.exactMatch, {
      numerator: 2,
      denominator: 3,
      value: 2 / 3,
    });
    assert.equal(report.summary.apiRecall.numerator, 5);
    assert.equal(report.summary.apiRecall.denominator, 6);
    assert.equal(report.summary.firstProposalValidity.numerator, 3);
    assert.equal(report.cohorts.development.exactMatch.value, null);
    assert.equal(report.cohorts.holdout.attempted, 3);
    assert.equal(report.summary.tokenUsage.total_tokens, 48);
  });
});
test('schema-rejected attempts remain in all quality denominators and are not retried', async () => {
  await withDataset(async (path) => {
    const observer = new SelectionEvaluationObserver();
    const model = scriptedModel(observer, (n) => ({
      operations: [
        {
          candidateId: n === 2 ? 'invalid-candidate' : 'candidate-1',
          purpose: 'Read',
        },
      ],
      gaps: [],
    }));
    const report = await runApiSelectionEvaluation({
      prepared: await prepareApiSelectionEvaluation(path),
      model,
      modelLabel: 'scripted-test-not-quality',
      observer,
    });
    assert.equal(model.calls(), 3);
    assert.equal(report.summary.rejected, 1);
    assert.equal(report.summary.exactMatch.denominator, 3);
    assert.equal(report.summary.apiRecall.denominator, 6);
    assert.equal(report.attempts[1].model.responses.length, 1);
    assert.equal(report.attempts[1].selection, null);
    assert.ok(report.attempts[1].error.validationIssues.length > 0);
  });
});
test('an interrupted run does not report partial returned-response usage as a complete token total', async () => {
  await withDataset(async (path) => {
    const observer = new SelectionEvaluationObserver();
    const failure = new Error('Transport failure');
    failure.status = 503;
    const model = scriptedModel(observer, (n, input) =>
      n === 2
        ? failure
        : {
            operations: input.candidates.map((candidate) => ({
              candidateId: candidate.candidateId,
              purpose: 'Read',
            })),
            gaps: [],
          },
    );
    const report = await runApiSelectionEvaluation({
      prepared: await prepareApiSelectionEvaluation(path),
      model,
      modelLabel: 'scripted-test-not-quality',
      observer,
    });
    assert.equal(model.calls(), 2);
    assert.equal(report.summary.measuredModelResponses, 1);
    assert.equal(report.summary.tokenUsage, null);
    assert.equal(report.unattempted, 1);
    assert.equal(report.summary.exactMatch.denominator, 2);
  });
});
test('a catalog without REST APIs records the deterministic gap without claiming a model proposal', async () => {
  await withDataset(async (path) => {
    const prepared = await prepareApiSelectionEvaluation(path);
    const observer = new SelectionEvaluationObserver();
    const model = scriptedModel(observer, () => {
      throw new Error('The model must not be called');
    });
    const report = await runApiSelectionEvaluation({
      prepared: {
        ...prepared,
        operations: [],
        dataset: {
          ...prepared.dataset,
          cases: [
            { ...expectedCase, expectedOperations: [], expectedGap: true },
          ],
        },
      },
      model,
      modelLabel: 'scripted-test-not-quality',
      observer,
    });
    assert.equal(model.calls(), 0);
    assert.equal(report.summary.exactMatch.numerator, 3);
    assert.equal(report.summary.firstProposalValidity.value, null);
    assert.equal(report.summary.tokenUsage, null);
  });
});
test('transport failure stops the run, records rejection and exposes every unattempted case', async () => {
  await withDataset(async (path) => {
    const observer = new SelectionEvaluationObserver();
    const failure = new Error(
      'Do not persist raw transport message: secret-example',
    );
    failure.status = 403;
    const model = scriptedModel(observer, () => failure);
    const report = await runApiSelectionEvaluation({
      prepared: await prepareApiSelectionEvaluation(path),
      model,
      modelLabel: 'scripted-test-not-quality',
      observer,
    });
    assert.equal(model.calls(), 1);
    assert.equal(report.complete, false);
    assert.equal(report.unattempted, 2);
    assert.equal(report.attempts[0].error.status, 403);
    assert.equal(report.summary.tokenUsage, null);
    assert.equal(JSON.stringify(report).includes('secret-example'), false);
  });
});
test('missing standardized token metadata is unavailable rather than zero usage', () => {
  const observer = new SelectionEvaluationObserver();
  observer.handleLLMStart();
  observer.handleLLMEnd({
    generations: [[{ text: 'answer', message: new AIMessage('answer') }]],
    llmOutput: { headers: { authorization: 'never-save' } },
  });
  const evidence = observer.take();
  assert.equal(evidence.calls, 1);
  assert.equal(evidence.responses[0].usage, null);
  assert.equal(JSON.stringify(evidence).includes('never-save'), false);
  assert.deepEqual(observer.take(), { calls: 0, responses: [] });
});
