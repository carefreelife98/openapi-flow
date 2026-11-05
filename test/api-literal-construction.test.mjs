import assert from 'node:assert/strict';
import test from 'node:test';
import { createValidator } from '@scalar/json-schema-validator';
import {
  generateApiArguments,
  createApiArgumentRejection,
} from '@openapi-flow/langchain';
import { describeApiLiteralJsonSources } from '@openapi-flow/core';
import { requestOperation } from './fixtures/api-argument-generation-fixture.mjs';
import { literalGenerationModel } from './fixtures/literal-generation-fixture.mjs';

const text = (targetPointer, sourceText) => ({
  targetPointer,
  sourceFormat: 'text',
  sourceText,
});
const plan = (sources) => ({
  literalInputs: { state: 'provided', literalSources: sources },
  requestedInputs: ['/body/ids'],
});
async function fixture(source = '상품 101, 102, 103을 확인해 줘.') {
  return {
    operation: await requestOperation({
      type: 'object',
      additionalProperties: false,
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 3,
          maxItems: 3,
        },
        quantity: { type: 'integer' },
      },
    }),
    callId: 'source-construction',
    bindings: [],
    scenario: source,
    literalSourceMessages: [{ id: 'original', text: source }],
  };
}

test('natural-language list builds a string array in one source-backed call without a frozen parent target', async () => {
  const input = await fixture();
  const proposal = plan(
    ['101', '102', '103'].map((id, i) => text(`/body/ids/${i}`, id)),
  );
  const model = literalGenerationModel(proposal, ({ schema }) => {
    assert.equal(
      createValidator(schema)(proposal).valid,
      true,
      'provider schema must have a satisfiable complete plan',
    );
  });
  const result = await generateApiArguments({ ...input, model });
  assert.equal(model.calls.length, 1);
  assert.deepEqual(result.values, { body: { ids: ['101', '102', '103'] } });
  assert.deepEqual(result.requestedInputs, ['/body/ids']);
  assert.deepEqual(
    result.literalSources.map((entry) => entry.sourceText),
    ['101', '102', '103'],
  );
});

test('parent text proposal is rejected as a whole; explicit replanning can change both target and assembly', async () => {
  const input = await fixture();
  const bad = literalGenerationModel(
    plan([text('/body/ids', '101, 102, 103')]),
  );
  let failure;
  await assert.rejects(
    generateApiArguments({ ...input, model: bad }),
    (error) => {
      failure = error;
      return error.diagnostic.code === 'API_ARGUMENT_VALIDATION_FAILED';
    },
  );
  assert.equal(
    bad.calls.length,
    1,
    'no unsolvable second model call or hidden retry',
  );
  const rejection = createApiArgumentRejection({ ...input, error: failure });
  assert.ok(rejection);
  const good = literalGenerationModel(
    plan(['101', '102', '103'].map((id, i) => text(`/body/ids/${i}`, id))),
  );
  const result = await generateApiArguments({
    ...input,
    model: good,
    rejectedProposals: [rejection],
  });
  assert.deepEqual(result.values.body.ids, ['101', '102', '103']);
  assert.equal(good.calls[0].payload.scenario, input.scenario);
  assert.deepEqual(
    good.calls[0].payload.literalSourceMessages,
    input.literalSourceMessages,
  );
});

test('an actual whole JSON array is copied once with its original type and receipt', async () => {
  const input = await fixture('이 목록을 사용해 줘: ["101","102","103"]');
  const candidate = describeApiLiteralJsonSources(
    input.literalSourceMessages,
  )[0].json.find((entry) => entry.text === '["101","102","103"]');
  const result = await generateApiArguments({
    ...input,
    model: literalGenerationModel(
      plan([
        {
          targetPointer: '/body/ids',
          sourceFormat: 'json',
          candidateId: candidate.id,
        },
      ]),
    ),
  });
  assert.deepEqual(result.values.body.ids, ['101', '102', '103']);
  assert.equal(result.literalSources.length, 1);
  assert.equal(result.literalSources[0].sourceText, candidate.text);
});

for (const [label, sources] of [
  ['sparse array', [text('/body/ids/1', '101')]],
  [
    'duplicate target',
    [text('/body/ids/0', '101'), text('/body/ids/0', '102')],
  ],
  [
    'parent-child overlap',
    [text('/body/ids', '101'), text('/body/ids/0', '101')],
  ],
  ['invented source', [text('/body/ids/0', '999')]],
  ['forbidden path', [text('/body/absent', '101')]],
  ['text-to-number conversion', [text('/body/quantity', '101')]],
  ['incomplete constrained container', [text('/body/ids/0', '101')]],
])
  test(`construction rejects ${label} without another model call`, async () => {
    const input = await fixture();
    const model = literalGenerationModel(plan(sources));
    await assert.rejects(generateApiArguments({ ...input, model }));
    assert.equal(model.calls.length, 1);
  });

test('real input absence stays a missing-input question instead of an invented empty array', async () => {
  const input = await fixture('상품 목록은 나중에 줄게. 목록으로 조회해 줘.');
  const result = await generateApiArguments({
    ...input,
    model: literalGenerationModel({
      literalInputs: { state: 'not-provided' },
      requestedInputs: ['/body/ids'],
    }),
  });
  assert.deepEqual(result.values, {});
  assert.deepEqual(result.unresolvedInputs, ['/body']);
  assert.deepEqual(result.requestedInputs, ['/body/ids']);
});

test('a primitive input with no compatible original source exposes absence rather than an impossible provided branch', async () => {
  const input = {
    operation: await requestOperation({ type: 'integer' }),
    callId: 'missing-number',
    bindings: [],
    scenario: '수량은 나중에 알려줄게.',
    literalSourceMessages: [{ id: 'request', text: '수량은 나중에 알려줄게.' }],
  };
  const model = literalGenerationModel(
    { literalInputs: { state: 'not-provided' }, requestedInputs: ['/body'] },
    ({ schema, payload }) => {
      assert.equal(
        schema.properties.literalInputs.properties.state.const,
        'not-provided',
      );
      assert.equal(Object.hasOwn(payload, 'literalJsonSources'), false);
    },
  );
  const result = await generateApiArguments({ ...input, model });
  assert.deepEqual(result.values, {});
  assert.deepEqual(result.unresolvedInputs, ['/body']);
  assert.equal(model.calls.length, 1);
});

test('wrong text-message attribution reports exact eligible identities without reassigning the source', async () => {
  const input = await fixture();
  input.literalSourceMessages.push({
    id: 'later',
    text: '현재 상태만 조회해 줘.',
  });
  const selections = ['101', '102', '103'].map((id, i) => ({
    ...text(`/body/ids/${i}`, id),
    messageId: 'later',
  }));
  let failure;
  await assert.rejects(
    generateApiArguments({
      ...input,
      model: literalGenerationModel(plan(selections)),
    }),
    (error) => {
      failure = error;
      assert.match(error.message, /selected original message later/);
      assert.match(
        error.message,
        /Original messages containing that exact complete sourceText: \["original"\]/,
      );
      return error.diagnostic.code === 'API_ARGUMENT_VALIDATION_FAILED';
    },
  );
  assert.deepEqual(
    createApiArgumentRejection({ ...input, error: failure }).output
      .literalInputs.literalSources,
    selections,
  );
  const corrected = selections.map((entry) => ({
    ...entry,
    messageId: 'original',
  }));
  const accepted = await generateApiArguments({
    ...input,
    model: literalGenerationModel(plan(corrected)),
  });
  assert.deepEqual(accepted.values.body.ids, ['101', '102', '103']);
});
