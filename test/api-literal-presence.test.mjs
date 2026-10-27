import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectApiArgumentRequirements,
  OpenApiFlowError,
} from '@openapi-flow/core';
import { generateApiArguments } from '@openapi-flow/langchain';
import { requestOperation } from './fixtures/api-argument-generation-fixture.mjs';
import { literalGenerationModel } from './fixtures/literal-generation-fixture.mjs';

test('an explicit no-literal decision reaches required and requested input questions without a placeholder body', async () => {
  const operation = await requestOperation({
    type: 'object',
    additionalProperties: false,
    required: ['text'],
    properties: { text: { type: 'string' }, requirement: { type: 'string' } },
  });
  const output = {
    literalInputs: { state: 'not-provided' },
    requestedInputs: ['/body/text', '/body/requirement'],
    explanation: { reason: '실제 원문과 요구사항 값이 제공되지 않았습니다.' },
  };
  const before = globalThis.structuredClone(output);
  const model = literalGenerationModel(output);
  const input = {
    operation,
    callId: 'unprovided-body',
    bindings: [],
    scenario: '원문과 검수 요구사항을 사용해서 검수해줘.',
    requestMediaType: 'application/json',
    trackRequestedInputs: true,
    includeExplanations: true,
    model,
  };
  const result = await generateApiArguments(input);
  assert.deepEqual(output, before);
  assert.deepEqual(result.values, {});
  assert.equal(Object.hasOwn(result.values, 'body'), false);
  assert.deepEqual(result.literalSources, []);
  assert.deepEqual(result.requestedInputs, output.requestedInputs);
  assert.deepEqual(result.literalGeneration.proposedValues, {});
  const inspection = inspectApiArgumentRequirements({ ...input, ...result });
  assert.equal(inspection.status, 'needs-input');
  assert.deepEqual(
    inspection.requirements.map((item) => item.targetPointer),
    ['/body'],
  );
  assert.deepEqual(
    inspection.requirements[0].requestedInputs,
    output.requestedInputs,
  );
  assert.equal(model.calls.length, 1);
});

for (const value of [{}, [], null, '', 0, false])
  test(`an explicit sourced body ${JSON.stringify(value)} is preserved with its original JSON type`, async () => {
    const operation = await requestOperation({});
    const text = JSON.stringify(value);
    const output = {
      literalInputs: {
        state: 'provided',
        values: { body: value },
        literalSources: [
          { targetPointer: '/body', sourceFormat: 'json', sourceText: text },
        ],
      },
      requestedInputs: ['/body'],
    };
    const result = await generateApiArguments({
      operation,
      callId: 'explicit-empty',
      bindings: [],
      scenario: `Send body ${text} exactly.`,
      requestMediaType: 'application/json',
      trackRequestedInputs: true,
      model: literalGenerationModel(output),
    });
    assert.deepEqual(result.values, { body: value });
    assert.deepEqual(result.unresolvedInputs, []);
    assert.equal(result.literalSources[0].sourceText, text);
  });

test('partial typed values keep their source while unspecified siblings remain questions', async () => {
  const operation = await requestOperation({
    type: 'object',
    additionalProperties: false,
    required: ['id', 'quantity'],
    properties: { id: { type: 'string' }, quantity: { type: 'integer' } },
  });
  const output = {
    literalInputs: {
      state: 'provided',
      values: { body: { id: '0007' } },
      literalSources: [
        {
          targetPointer: '/body/id',
          sourceFormat: 'json',
          sourceText: '"0007"',
        },
      ],
    },
    requestedInputs: ['/body/quantity'],
  };
  const result = await generateApiArguments({
    operation,
    callId: 'partial',
    bindings: [],
    scenario: 'Use id "0007" and ask for quantity.',
    trackRequestedInputs: true,
    model: literalGenerationModel(output),
  });
  assert.deepEqual(result.values, { body: { id: '0007' } });
  assert.deepEqual(result.unresolvedInputs, ['/body/quantity']);
});

test('absence never repairs a supplied body, source-free empties, legacy tracked outputs or mixed decisions', async () => {
  const operation = await requestOperation({});
  for (const output of [
    { values: { body: {} }, literalSources: [], requestedInputs: ['/body'] },
    {
      literalInputs: { state: 'not-provided', values: { body: {} } },
      requestedInputs: ['/body'],
    },
    {
      literalInputs: {
        state: 'provided',
        values: { body: {} },
        literalSources: [],
      },
      requestedInputs: ['/body'],
    },
    {
      literalInputs: {
        state: 'provided',
        values: { query: {} },
        literalSources: [],
      },
      requestedInputs: [],
    },
    {
      literalInputs: { state: 'not-provided' },
      values: { body: {} },
      literalSources: [],
      requestedInputs: ['/body'],
    },
  ]) {
    const original = globalThis.structuredClone(output);
    const model = literalGenerationModel(output);
    await assert.rejects(
      generateApiArguments({
        operation,
        callId: 'invalid-presence',
        bindings: [],
        scenario: 'Actual body is missing.',
        trackRequestedInputs: true,
        model,
      }),
      (error) => {
        assert(error instanceof OpenApiFlowError);
        assert.equal(error.diagnostic.code, 'MODEL_OUTPUT_INVALID');
        return true;
      },
    );
    assert.deepEqual(output, original);
    assert.equal(model.calls.length, 1);
  }
});

test('a provided empty body still needs an exact original source; availability is not evidence', async () => {
  const operation = await requestOperation({});
  const output = {
    literalInputs: {
      state: 'provided',
      values: { body: {} },
      literalSources: [
        { targetPointer: '/body', sourceFormat: 'json', sourceText: '{}' },
      ],
    },
    requestedInputs: ['/body'],
  };
  await assert.rejects(
    generateApiArguments({
      operation,
      callId: 'false-empty',
      bindings: [],
      scenario: 'The body has not been supplied.',
      trackRequestedInputs: true,
      model: literalGenerationModel(output),
    }),
    (error) => {
      assert.equal(error.diagnostic.code, 'API_ARGUMENT_VALIDATION_FAILED');
      assert.equal(error.diagnostic.stage, 'contract-validation');
      return true;
    },
  );
});
