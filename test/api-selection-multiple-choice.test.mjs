import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createApiCatalog,
  resolveApiSelectionAnswers,
} from '@openapi-flow/core';
import { analyzeApiSelection } from '@openapi-flow/langchain';

async function fixture() {
  const catalog = await createApiCatalog([
    {
      id: 'reports',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Reports', version: '1' },
        paths: Object.fromEntries(
          ['current', 'recent', 'ranked', 'archive'].map((name) => [
            `/reports/${name}`,
            { get: { responses: { 200: { description: 'OK' } } } },
          ]),
        ),
      },
    },
  ]);
  const question = {
    kind: 'operation-multiple-choice',
    id: 'report-scope',
    message: 'Select at least three report sources.',
    purpose: 'Collect report sources',
    candidates: catalog.operations,
    minSelections: 3,
    maxSelections: 4,
  };
  const analysis = {
    selection: { operations: [], gaps: [] },
    questions: [question],
  };
  return { catalog, question, analysis };
}

test('one API question resolves an explicit three-of-four answer without model inference or input mutation', async () => {
  const { catalog, question, analysis } = await fixture();
  const operations = [
    question.candidates[2].key,
    question.candidates[0].key,
    question.candidates[3].key,
  ];
  const answers = [{ questionId: question.id, operations }];
  const before = globalThis.structuredClone({ analysis, answers });
  const result = await resolveApiSelectionAnswers({
    catalog,
    analysis,
    answers,
  });
  assert.deepEqual(
    result.selection.operations.map((item) => item.key),
    operations,
  );
  assert.deepEqual(result.questions, []);
  assert.deepEqual({ analysis, answers }, before);
});

test('multiple API answers enforce the declared range, distinct offered keys and matching answer shape', async () => {
  const { catalog, question, analysis } = await fixture();
  const keys = question.candidates.map((candidate) => candidate.key);
  for (const answer of [
    { questionId: question.id, operations: keys.slice(0, 2) },
    { questionId: question.id, operations: [keys[0], keys[0], keys[1]] },
    {
      questionId: question.id,
      operations: [...keys.slice(0, 2), { ...keys[2], snapshotId: 'stale' }],
    },
    { questionId: question.id, operation: keys[0] },
    { questionId: 'stale-question', operations: keys },
  ])
    await assert.rejects(
      resolveApiSelectionAnswers({ catalog, analysis, answers: [answer] }),
    );
  await assert.rejects(
    resolveApiSelectionAnswers({
      catalog,
      analysis: { ...analysis, questions: [{ ...question, maxSelections: 3 }] },
      answers: [{ questionId: question.id, operations: keys }],
    }),
  );
});

test('invalid multiple-choice bounds fail at the source contract rather than silently becoming single-choice', async () => {
  const { catalog, question, analysis } = await fixture();
  for (const change of [
    { minSelections: undefined },
    { maxSelections: undefined },
    { minSelections: 4, maxSelections: 3 },
    { maxSelections: 5 },
    { minSelections: -1 },
  ])
    await assert.rejects(
      resolveApiSelectionAnswers({
        catalog,
        analysis: { ...analysis, questions: [{ ...question, ...change }] },
        answers: [
          {
            questionId: question.id,
            operations: question.candidates.map((candidate) => candidate.key),
          },
        ],
      }),
    );
});

test('explicit zero selections are accepted only when the source question permits zero', async () => {
  const { catalog, question, analysis } = await fixture();
  const result = await resolveApiSelectionAnswers({
    catalog,
    analysis: { ...analysis, questions: [{ ...question, minSelections: 0 }] },
    answers: [{ questionId: question.id, operations: [] }],
  });
  assert.deepEqual(result, {
    selection: { operations: [], gaps: [] },
    questions: [],
  });
});

test('legacy single API questions keep exactly-one semantics and reject multi-answer envelopes', async () => {
  const { catalog, question } = await fixture();
  const { minSelections, maxSelections, ...original } = question;
  void minSelections;
  void maxSelections;
  const single = { ...original, kind: 'operation-choice' };
  const analysis = {
    selection: { operations: [], gaps: [] },
    questions: [single],
  };
  const result = await resolveApiSelectionAnswers({
    catalog,
    analysis,
    answers: [{ questionId: single.id, operation: single.candidates[0].key }],
  });
  assert.equal(result.selection.operations.length, 1);
  await assert.rejects(
    resolveApiSelectionAnswers({
      catalog,
      analysis,
      answers: [
        { questionId: single.id, operations: [single.candidates[0].key] },
      ],
    }),
  );
});

test('LLM choice kind and counts become the immutable public question contract and fingerprint', async () => {
  const { catalog } = await fixture();
  let calls = 0;
  async function analyze(minSelections) {
    return analyzeApiSelection({
      operations: catalog.operations,
      scenario: 'Collect several selected report sources.',
      model: {
        withStructuredOutput() {
          return {
            async invoke(messages) {
              calls++;
              const payload = JSON.parse(messages[1].content);
              return {
                operations: [],
                gaps: [],
                questions: [
                  {
                    kind: 'multiple-choice',
                    message: 'Which report sources?',
                    purpose: 'Collect reports',
                    candidateIds: payload.candidates.map(
                      (candidate) => candidate.candidateId,
                    ),
                    minSelections,
                    maxSelections: 4,
                  },
                ],
              };
            },
          };
        },
      },
    });
  }
  const three = await analyze(3);
  const two = await analyze(2);
  assert.equal(three.questions[0].kind, 'operation-multiple-choice');
  assert.equal(three.questions[0].minSelections, 3);
  assert.equal(three.questions[0].maxSelections, 4);
  assert.notEqual(three.questions[0].id, two.questions[0].id);
  assert.equal(calls, 2);
  const result = await resolveApiSelectionAnswers({
    catalog,
    analysis: three,
    answers: [
      {
        questionId: three.questions[0].id,
        operations: three.questions[0].candidates
          .slice(0, 3)
          .map((candidate) => candidate.key),
      },
    ],
  });
  assert.equal(result.selection.operations.length, 3);
});

test('selection instructions in prose never supply a missing structured choice kind', async () => {
  const { catalog } = await fixture();
  await assert.rejects(
    analyzeApiSelection({
      operations: catalog.operations,
      scenario: 'Collect reports.',
      model: {
        withStructuredOutput() {
          return {
            async invoke(messages) {
              return {
                operations: [],
                gaps: [],
                questions: [
                  {
                    message: 'Select three or more APIs',
                    purpose: 'Collect reports',
                    candidateIds: JSON.parse(
                      messages[1].content,
                    ).candidates.map((candidate) => candidate.candidateId),
                  },
                ],
              };
            },
          };
        },
      },
    }),
  );
});
