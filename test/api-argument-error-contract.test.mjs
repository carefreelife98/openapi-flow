import { literalJsonCandidateId } from './fixtures/api-literal-json-source-choice.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OutputParserException } from '@langchain/core/output_parsers';
import { OpenApiFlowError } from '@openapi-flow/core';
import { generateApiArguments } from '@openapi-flow/langchain';
import {
  literalGenerationFixture,
  literalGenerationModel,
} from './fixtures/literal-generation-fixture.mjs';

function expectDiagnostic(code, stage, cause) {
  return (error) => {
    assert.ok(error instanceof OpenApiFlowError);
    assert.equal(error.diagnostic.code, code);
    assert.equal(error.diagnostic.stage, stage);
    if (cause !== undefined) assert.equal(error.cause, cause);
    assert.equal(JSON.stringify(error).includes('private'), false);
    assert.equal(JSON.stringify(error).includes('literal-consumer'), false);
    return true;
  };
}

test('argument input and model configuration errors identify their actual boundaries', async () => {
  const input = await literalGenerationFixture();
  for (const override of [
    { callId: '' },
    { model: undefined },
    { model: {} },
    { selectOasEnums: 'private-invalid-option' },
  ])
    await assert.rejects(
      generateApiArguments({ ...input, ...override }),
      expectDiagnostic('PLANNING_INPUT_INVALID', 'input-validation'),
    );
  const cause = new Error('private configuration error');
  await assert.rejects(
    generateApiArguments({
      ...input,
      model: {
        withStructuredOutput() {
          throw cause;
        },
      },
    }),
    expectDiagnostic(
      'MODEL_CONFIGURATION_FAILED',
      'model-configuration',
      cause,
    ),
  );
});

test('argument model failures preserve exact causes without heuristic timeout detection or retries', async () => {
  const input = await literalGenerationFixture();
  for (const [cause, code, stage] of [
    [
      new Error('private timeout text'),
      'MODEL_INVOCATION_FAILED',
      'model-invocation',
    ],
    [
      new globalThis.DOMException('private timeout', 'TimeoutError'),
      'MODEL_TIMEOUT',
      'model-invocation',
    ],
    [
      new globalThis.DOMException('private abort', 'AbortError'),
      'MODEL_ABORTED',
      'model-invocation',
    ],
    [
      new OutputParserException('private output'),
      'MODEL_OUTPUT_INVALID',
      'model-output',
    ],
  ]) {
    let calls = 0;
    const model = literalGenerationModel({}, () => {
      calls++;
      throw cause;
    });
    await assert.rejects(
      generateApiArguments({ ...input, model }),
      expectDiagnostic(code, stage, cause),
    );
    assert.equal(calls, 1);
  }
});

test('a foreign peer parser error uses the official code and retains its original cause without class/name heuristics', async () => {
  const input = await literalGenerationFixture();
  const foreign = new Error('Private foreign parser result');
  Object.defineProperty(foreign, 'lc_error_code', {
    value: 'OUTPUT_PARSING_FAILURE',
  });
  assert.equal(foreign instanceof OutputParserException, false);
  await assert.rejects(
    generateApiArguments({
      ...input,
      model: literalGenerationModel({}, () => {
        throw foreign;
      }),
    }),
    expectDiagnostic('MODEL_OUTPUT_INVALID', 'model-output', foreign),
  );
});

test('parser-looking text/name and an inherited or getter code do not authorize output-error classification', async () => {
  const input = await literalGenerationFixture();
  let getterCalls = 0;
  const getter = new Error('private');
  Object.defineProperty(getter, 'lc_error_code', {
    get() {
      getterCalls++;
      return 'OUTPUT_PARSING_FAILURE';
    },
  });
  const inherited = Object.create(new Error('private inherited'));
  Object.defineProperty(Object.getPrototypeOf(inherited), 'lc_error_code', {
    value: 'OUTPUT_PARSING_FAILURE',
  });
  const named = new Error('OUTPUT_PARSING_FAILURE timeout');
  named.name = 'OutputParserException';
  for (const cause of [getter, inherited, named])
    await assert.rejects(
      generateApiArguments({
        ...input,
        model: literalGenerationModel({}, () => {
          throw cause;
        }),
      }),
      expectDiagnostic('MODEL_INVOCATION_FAILED', 'model-invocation', cause),
    );
  assert.equal(getterCalls, 0);
});

test('argument output shape and original-source validation failures remain distinct', async () => {
  const input = await literalGenerationFixture();
  const invalidShape = literalGenerationModel({
    values: { body: { quantity: 'private-not-a-number' } },
  });
  await assert.rejects(
    generateApiArguments({ ...input, model: invalidShape }),
    expectDiagnostic('MODEL_OUTPUT_INVALID', 'model-output'),
  );
  const invalidSource = literalGenerationModel({
    literalInputs: {
      state: 'provided',
      values: { body: { quantity: 2 } },
      literalSources: [
        {
          targetPointer: '/body/quantity',
          sourceFormat: 'json',
          candidateId: literalJsonCandidateId('5'),
        },
      ],
    },
    requestedInputs: ['/body/quantity'],
  });
  await assert.rejects(
    generateApiArguments({
      ...input,
      model: invalidSource,
      trackRequestedInputs: true,
    }),
    expectDiagnostic('API_ARGUMENT_VALIDATION_FAILED', 'contract-validation'),
  );
  assert.equal(invalidSource.calls.length, 1);
});

test('argument boundaries preserve existing typed errors and successful values/options', async () => {
  const input = await literalGenerationFixture();
  const original = new OpenApiFlowError({
    message: 'private provider diagnostic',
    diagnostic: {
      owner: 'langchain',
      operation: 'explicitProvider',
      stage: 'model-invocation',
      code: 'MODEL_ABORTED',
    },
    cause: new Error('private original cause'),
  });
  await assert.rejects(
    generateApiArguments({
      ...input,
      model: literalGenerationModel({}, () => {
        throw original;
      }),
    }),
    (error) => error === original,
  );
  const model = literalGenerationModel({ values: { body: { quantity: 2 } } });
  const result = await generateApiArguments({ ...input, model });
  assert.deepEqual(result.values, {
    body: { id: 'confirmed-original', quantity: 2 },
  });
  assert.equal(model.calls.length, 1);
  assert.deepEqual(model.calls[0].options, {
    name: 'generate_api_arguments',
    method: 'functionCalling',
  });
});
