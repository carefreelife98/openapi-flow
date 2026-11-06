import assert from 'node:assert/strict';
import test from 'node:test';
import { createValidator } from '@scalar/json-schema-validator';
import { generateWorkflowApiArguments } from '../packages/langchain/dist/public-api.js';
import {
  fingerprintWorkflowApiArgumentContext,
  createWorkflowInputCatalog,
  validateCompiledWorkflowApiArguments,
} from '../packages/core/dist/public-api.js';
import { fixture } from './fixtures/workflow-api-argument-fixture.mjs';
import { literalGenerationModel as outputModel } from './fixtures/literal-generation-fixture.mjs';

function proposalOf(plan) {
  return Object.fromEntries(
    Object.entries(plan).filter(([key]) => key !== 'sourceFingerprint'),
  );
}
function literalGenerationModel(plan, observe) {
  return outputModel(proposalOf(plan), observe);
}

test('one shared model plan compiles six calls from code-owned input references', async () => {
  const { context, plan } = await fixture();
  const model = literalGenerationModel(plan, ({ schema, payload, options }) => {
    assert.equal(options.name, 'generate_workflow_api_arguments');
    assert.equal(createValidator(schema)(proposalOf(plan)).valid, true);
    assert.equal(payload.calls.length, 6);
    assert.equal(payload.sources.length, 2);
    assert.equal('literalSourceMessages' in payload, false);
    assert.equal(
      'messageId' in plan.calls['stock-1'].assignments[0].source,
      false,
    );
    assert.equal(
      'sourceText' in plan.calls['stock-1'].assignments[0].source,
      false,
    );
  });
  const result = await generateWorkflowApiArguments({
    ...context,
    model,
    selectOasEnums: true,
  });
  assert.deepEqual(result.rejections, []);
  assert.equal(result.arguments.length, 6);
  assert.equal(model.calls.length, 1);
});

test('accepted calls are returned separately from an incompatible call proposal', async () => {
  const { context, plan } = await fixture();
  plan.calls['stock-2'].assignments.push(
    globalThis.structuredClone(plan.calls['stock-2'].assignments[0]),
  );
  const result = await generateWorkflowApiArguments({
    ...context,
    model: literalGenerationModel(plan),
  });
  assert.equal(result.arguments.length, 5);
  assert.equal(result.rejections.length, 1);
  assert.equal(result.rejections[0].callId, 'stock-2');
  const pending = {
    ...context,
    calls: context.calls.filter((x) => x.callId === 'stock-2'),
  };
  const correction = {
    sourceFingerprint: fingerprintWorkflowApiArgumentContext(pending),
    calls: {
      'stock-2': {
        ...plan.calls['stock-2'],
        assignments: plan.calls['stock-2'].assignments.slice(0, 2),
      },
    },
  };
  const model = literalGenerationModel(correction, ({ payload }) => {
    assert.equal(payload.calls.length, 1);
    assert.equal(payload.calls[0].callId, 'stock-2');
    assert.equal(payload.rejectedCalls.length, 1);
  });
  const fixed = await generateWorkflowApiArguments({
    ...pending,
    model,
    rejectedCalls: result.rejections,
  });
  assert.deepEqual(fixed.rejections, []);
  assert.deepEqual(fixed.arguments[0].values, {
    path: { id: '102' },
    query: { sequence: 0 },
  });
});

test('the output schema has no free quotation or message identity fields', async () => {
  const { context, plan, inputs } = await fixture();
  const model = literalGenerationModel(plan, ({ schema }) => {
    const proposal = proposalOf(plan);
    const wrong = globalThis.structuredClone(proposal);
    wrong.calls['stock-1'].assignments[0].source.sourceText = '101';
    wrong.calls['stock-1'].assignments[0].source.messageId = 'conditions';
    assert.equal(createValidator(schema)(wrong).valid, false);
    const unknown = globalThis.structuredClone(proposal);
    unknown.calls['stock-1'].assignments[0].source.sourceId = 'unknown-source';
    assert.equal(createValidator(schema)(unknown).valid, false);
    const numericForString = globalThis.structuredClone(proposal);
    numericForString.calls['stock-2'].assignments[0].source = inputs[3];
    assert.equal(createValidator(schema)(numericForString).valid, false);
    const numericForStringItem = globalThis.structuredClone(proposal);
    numericForStringItem.calls.info.assignments[0].source = inputs[3];
    assert.equal(createValidator(schema)(numericForStringItem).valid, false);
  });
  await generateWorkflowApiArguments({ ...context, model });
});

test('all confirmed or bound calls are compiled without a model', async () => {
  const { context } = await fixture();
  const call = context.calls.find((x) => x.callId === 'stock-1');
  const calls = [
    {
      ...call,
      confirmedInputs: [
        {
          callId: call.callId,
          operation: call.operation.key,
          targetPointer: '/path/id',
          value: '101',
        },
        {
          callId: call.callId,
          operation: call.operation.key,
          targetPointer: '/query/sequence',
          value: 0,
        },
      ],
    },
  ];
  const result = await generateWorkflowApiArguments({ ...context, calls });
  assert.deepEqual(result.rejections, []);
  assert.deepEqual(result.arguments[0].values, {
    path: { id: '101' },
    query: { sequence: 0 },
  });
});

test('transport failure is preserved and never triggers an implicit planning retry', async () => {
  const { context } = await fixture();
  const cause = new Error('transport failure');
  let attempts = 0;
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          attempts++;
          throw cause;
        },
      };
    },
  };
  await assert.rejects(
    generateWorkflowApiArguments({ ...context, model }),
    (error) =>
      error.cause === cause &&
      error.diagnostic.code === 'MODEL_INVOCATION_FAILED',
  );
  assert.equal(attempts, 1);
});

test('mutated call contracts and stale repair feedback fail rather than being reused', async () => {
  const { context, plan } = await fixture();
  const model = literalGenerationModel(plan, () => {
    context.calls[0].purpose = 'changed';
  });
  await assert.rejects(
    generateWorkflowApiArguments({ ...context, model }),
    /changed while planning/,
  );
  await assert.rejects(
    generateWorkflowApiArguments({
      ...context,
      rejectedCalls: [
        { callId: 'info', reason: 'old', sourceFingerprint: 'previous' },
      ],
    }),
    /does not match/,
  );
});

test('semantic enum decisions remain separate from copied source values and can be revalidated', async () => {
  const { context } = await fixture();
  const single = {
    ...context,
    catalog: createWorkflowInputCatalog([
      { id: 'request', text: '일반 상품 분류의 동기화 상태를 확인해 줘.' },
    ]),
    calls: context.calls.filter((x) => x.callId === 'sync'),
  };
  const plan = {
    sourceFingerprint: fingerprintWorkflowApiArgumentContext(single),
    calls: { sync: { assignments: [], requestedInputs: ['/query/category'] } },
  };
  const stages = [];
  const model = {
    withStructuredOutput(_schema, options) {
      return {
        async invoke(messages) {
          stages.push(options.name);
          const payload = JSON.parse(messages[1].content);
          if (options.name === 'generate_workflow_api_arguments') {
            const proposal = proposalOf(plan);
            return proposal;
          }
          assert.equal(options.name, 'select_api_argument_enums');
          return {
            decisions: {
              [payload.questions[0].id]: {
                status: 'selected',
                candidateId: payload.enumChoices[0].candidates[0].id,
              },
            },
          };
        },
      };
    },
  };
  const result = await generateWorkflowApiArguments({
    ...single,
    model,
    selectOasEnums: true,
  });
  assert.deepEqual(stages, [
    'generate_workflow_api_arguments',
    'select_api_argument_enums',
  ]);
  assert.deepEqual(result.arguments[0].values, {
    query: { category: 'GOODS' },
  });
  assert.deepEqual(result.arguments[0].literalSources, []);
  assert.equal(
    result.arguments[0].enumInterpretation.analysis.enumSelections.length,
    1,
  );
  assert.deepEqual(
    validateCompiledWorkflowApiArguments({ ...single, result }),
    result,
  );
});
