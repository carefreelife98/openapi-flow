import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenApiFlowError } from '@openapi-flow/core';
import {
  ApiArgumentPlanningError,
  createApiArgumentRejection,
  generateApiArguments,
  apiArgumentRejectionSchema,
} from '@openapi-flow/langchain';
import {
  literalGenerationFixture,
  literalGenerationModel,
} from './fixtures/literal-generation-fixture.mjs';
import { requestOperation } from './fixtures/api-argument-generation-fixture.mjs';

async function rejected(input, output) {
  const model = literalGenerationModel(output);
  let failure;
  await assert.rejects(generateApiArguments({ ...input, model }), (error) => {
    failure = error;
    return true;
  });
  assert.ok(failure instanceof ApiArgumentPlanningError);
  assert.equal(model.calls.length, 1, 'OSS must not retry a rejected proposal');
  const rejection = createApiArgumentRejection({ ...input, error: failure });
  assert.ok(rejection);
  return { failure, rejection };
}

test('unchanged-source literal replanning gets exact separate feedback without altering scenario or automatic retries', async () => {
  const input = await literalGenerationFixture();
  const output = { values: { body: { quantity: 'wrong-type' } } };
  const { failure, rejection } = await rejected(input, output);
  assert.ok(failure.originalError instanceof OpenApiFlowError);
  assert.equal(failure.cause, failure.originalError.cause);
  assert.deepEqual(rejection.output, output);
  assert.equal(rejection.code, 'MODEL_OUTPUT_INVALID');
  assert.equal(rejection.stage, 'model-output');
  assert.deepEqual(JSON.parse(JSON.stringify(failure)), failure.diagnostic);
  assert.equal(JSON.stringify(failure).includes('wrong-type'), false);
  const before = globalThis.structuredClone(rejection);
  const model = literalGenerationModel({ values: { body: { quantity: 2 } } });
  const result = await generateApiArguments({
    ...input,
    model,
    rejectedProposals: [rejection],
  });
  assert.equal(model.calls.length, 1);
  assert.equal(model.calls[0].payload.scenario, input.scenario);
  assert.deepEqual(model.calls[0].payload.rejectedProposals, [before]);
  assert.deepEqual(rejection, before);
  assert.deepEqual(result.values, {
    body: { id: 'confirmed-original', quantity: 2 },
  });
  assert.equal(Object.hasOwn(result, 'rejectedProposals'), false);
});

test('feedback is rejected before invoking a model after source, role, OAS, confirmed input or option changes', async () => {
  const input = await literalGenerationFixture();
  const { failure, rejection } = await rejected(input, {
    values: { body: { quantity: 'wrong' } },
  });
  const operation = globalThis.structuredClone(input.operation);
  operation.operation.description = 'changed OAS';
  const changed = [
    { ...input, scenario: input.scenario + ' changed' },
    { ...input, purpose: 'different role' },
    {
      ...input,
      bindings: [
        {
          kind: 'node-output',
          sourceNodeId: 'producer',
          sourcePointer: '/body/enabled',
          targetPointer: '/body/enabled',
        },
      ],
    },
    { ...input, operation },
    { ...input, includeExplanations: true },
    {
      ...input,
      confirmedInputs: input.confirmedInputs.map((value) => ({
        ...value,
        value: 'different',
      })),
    },
    {
      ...input,
      callId: 'another-call',
      confirmedInputs: input.confirmedInputs.map((value) => ({
        ...value,
        callId: 'another-call',
      })),
    },
  ];
  for (const current of changed) {
    assert.equal(
      createApiArgumentRejection({ ...current, error: failure }),
      undefined,
    );
    const model = literalGenerationModel({ values: { body: { quantity: 2 } } });
    await assert.rejects(
      generateApiArguments({
        ...current,
        model,
        rejectedProposals: [rejection],
      }),
      (error) => error.diagnostic.code === 'PLANNING_INPUT_INVALID',
    );
    assert.equal(model.calls.length, 0);
  }
});

test('a provider parser failure retains the documented raw output without extracting or repairing its message', async () => {
  const input = await literalGenerationFixture();
  const raw = '{"values":{"body":{"quantity":"bad"}}}';
  const parser = new Error('private parser message unrelated to JSON');
  Object.defineProperty(parser, 'lc_error_code', {
    value: 'OUTPUT_PARSING_FAILURE',
  });
  Object.defineProperty(parser, 'llmOutput', { value: raw });
  const model = literalGenerationModel({}, () => {
    throw parser;
  });
  let failure;
  await assert.rejects(generateApiArguments({ ...input, model }), (error) => {
    failure = error;
    return error instanceof ApiArgumentPlanningError && error.cause === parser;
  });
  const feedback = createApiArgumentRejection({ ...input, error: failure });
  assert.equal(feedback.output, raw);
  assert.equal(typeof feedback.output, 'string');
  assert.equal(model.calls.length, 1);
});

test('transport and arbitrary typed errors cannot become literal rejection feedback', async () => {
  const input = await literalGenerationFixture();
  for (const cause of [
    new Error('HTTP 400 wrong schema in text'),
    new globalThis.DOMException('deadline', 'TimeoutError'),
  ]) {
    const model = literalGenerationModel({}, () => {
      throw cause;
    });
    await assert.rejects(generateApiArguments({ ...input, model }), (error) => {
      assert.equal(error instanceof ApiArgumentPlanningError, false);
      assert.equal(createApiArgumentRejection({ ...input, error }), undefined);
      assert.equal(error.cause, cause);
      return true;
    });
    assert.equal(model.calls.length, 1);
  }
  assert.equal(
    createApiArgumentRejection({
      ...input,
      error: new Error('output invalid'),
    }),
    undefined,
  );
});

test('rejected output is never a new literal source even if the next proposal quotes it exactly', async () => {
  const input = {
    ...(await literalGenerationFixture()),
    trackRequestedInputs: true,
  };
  const output = {
    literalInputs: {
      state: 'provided',
      values: { body: { quantity: 99 } },
      literalSources: [
        {
          targetPointer: '/body/quantity',
          sourceFormat: 'json',
          sourceText: '99',
        },
      ],
    },
    requestedInputs: ['/body/quantity'],
  };
  const { rejection } = await rejected(input, output);
  assert.equal(rejection.stage, 'contract-validation');
  const model = literalGenerationModel(output);
  await assert.rejects(
    generateApiArguments({ ...input, model, rejectedProposals: [rejection] }),
    (error) => {
      assert.equal(error.diagnostic.code, 'API_ARGUMENT_VALIDATION_FAILED');
      return true;
    },
  );
  assert.equal(model.calls.length, 1);
  assert.equal(model.calls[0].payload.scenario.includes('99'), false);
});

test('non-JSON rejected data and forged feedback fields are not silently repaired', async () => {
  const input = await literalGenerationFixture();
  let failure;
  await assert.rejects(
    generateApiArguments({
      ...input,
      model: literalGenerationModel({
        values: { body: { quantity: new Date('2026-01-01') } },
      }),
    }),
    (error) => {
      failure = error;
      return true;
    },
  );
  assert.equal(
    createApiArgumentRejection({ ...input, error: failure }),
    undefined,
  );
  const { rejection } = await rejected(input, {
    values: { body: { quantity: 'bad' } },
  });
  assert.throws(() =>
    apiArgumentRejectionSchema.parse({ ...rejection, httpStatus: 400 }),
  );
  const model = literalGenerationModel({ values: { body: { quantity: 2 } } });
  await assert.rejects(
    generateApiArguments({
      ...input,
      model,
      rejectedProposals: [{ ...rejection, stage: 'model-invocation' }],
    }),
  );
  assert.equal(model.calls.length, 0);
});

test('an enum interpretation rejection belongs to its own stage, not literal-value replanning', async () => {
  const operation = await requestOperation({
    type: 'object',
    required: ['order'],
    properties: { order: { type: 'string', enum: ['VIEWS', 'NEW'] } },
  });
  const input = {
    operation,
    callId: 'enum-origin',
    bindings: [],
    scenario: '조회수 순으로 조회해줘.',
    requestMediaType: 'application/json',
    selectOasEnums: true,
  };
  const calls = [];
  const model = {
    withStructuredOutput(_schema, options) {
      return {
        async invoke() {
          calls.push(options.name);
          if (options.name === 'generate_api_arguments')
            return {
              literalInputs: { state: 'not-provided' },
              requestedInputs: ['/body/order'],
            };
          assert.equal(options.name, 'extract_api_input_answers');
          return { answers: 'wrong shape' };
        },
      };
    },
  };
  await assert.rejects(generateApiArguments({ ...input, model }), (error) => {
    assert.equal(error instanceof ApiArgumentPlanningError, false);
    assert.equal(error.diagnostic.code, 'MODEL_OUTPUT_INVALID');
    assert.equal(createApiArgumentRejection({ ...input, error }), undefined);
    return true;
  });
  assert.deepEqual(calls, [
    'generate_api_arguments',
    'extract_api_input_answers',
  ]);
});
