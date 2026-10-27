import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeApiLiteralGeneration,
  validateApiLiteralGenerationRecord,
} from '@openapi-flow/core';
import {
  generateApiArguments,
  createApiArgumentRejection,
} from '@openapi-flow/langchain';
import { requestOperation } from './fixtures/api-argument-generation-fixture.mjs';
import { literalGenerationModel } from './fixtures/literal-generation-fixture.mjs';

async function input() {
  return {
    callId: 'source-context',
    operation: await requestOperation({
      type: 'object',
      additionalProperties: false,
      required: ['id', 'count'],
      properties: { id: { type: 'string' }, count: { type: 'integer' } },
    }),
    bindings: [],
    scenario: JSON.stringify({
      requests: ['원문 상품 "0007"로 조회해줘.'],
      answers: ['개수는 0이야.'],
    }),
    literalSourceMessages: [
      { id: 'request', text: '원문 상품 "0007"로 조회해줘.' },
    ],
    includeExplanations: true,
  };
}

function output(
  sources = [
    { targetPointer: '/body/id', sourceFormat: 'json', sourceText: '"0007"' },
  ],
) {
  return {
    literalInputs: {
      state: 'provided',
      values: { body: { id: '0007' } },
      literalSources: sources,
    },
    requestedInputs: [],
    explanation: { reason: '원본 상품번호를 그대로 사용했습니다.' },
  };
}

test('explicit original messages separate literal attribution from JSON prompt context without changing either', async () => {
  const source = await input();
  const before = globalThis.structuredClone(source);
  const model = literalGenerationModel(output());
  const result = await generateApiArguments({ ...source, model });
  assert.deepEqual(source, before);
  assert.deepEqual(result.values, { body: { id: '0007' } });
  assert.deepEqual(result.unresolvedInputs, ['/body/count']);
  assert.equal(result.literalSources[0].messageId, 'request');
  assert.equal(result.literalSources[0].sourceText, '"0007"');
  assert.equal(model.calls.length, 1);
  assert.deepEqual(
    model.calls[0].payload.literalSourceMessages,
    source.literalSourceMessages,
  );
  assert.equal(model.calls[0].payload.scenario, source.scenario);
  const provided = model.calls[0].schema.properties.literalInputs.anyOf[1];
  assert.equal(
    'messageId' in provided.properties.literalSources.items.properties,
    false,
  );
  validateApiLiteralGenerationRecord({
    ...source,
    record: result.literalGeneration,
  });
  assert.throws(
    () =>
      validateApiLiteralGenerationRecord({
        ...source,
        literalSourceMessages: [{ id: 'request', text: '다른 원문' }],
        record: result.literalGeneration,
      }),
    /differs/,
  );
});

test('multiple actual source messages require exact supplied IDs and preserve typed values from different answers', async () => {
  const source = await input();
  source.literalSourceMessages.push({ id: 'answer', text: '개수는 0이야.' });
  const proposed = output([
    {
      targetPointer: '/body/id',
      sourceFormat: 'json',
      sourceText: '"0007"',
      messageId: 'request',
    },
    {
      targetPointer: '/body/count',
      sourceFormat: 'json',
      sourceText: '0',
      messageId: 'answer',
    },
  ]);
  proposed.literalInputs.values.body.count = 0;
  const result = await generateApiArguments({
    ...source,
    model: literalGenerationModel(proposed),
  });
  assert.deepEqual(result.values, { body: { id: '0007', count: 0 } });
  assert.deepEqual(
    result.literalSources.map((item) => item.messageId),
    ['request', 'answer'],
  );
  assert.deepEqual(result.unresolvedInputs, []);
});

for (const messageId of [undefined, 'scenario', 'invented', 'answer'])
  test(`multiple-source attribution rejects missing, unknown or wrong message identity: ${messageId}`, async () => {
    const source = await input();
    source.literalSourceMessages.push({ id: 'answer', text: '개수는 0이야.' });
    const proposed = output([
      {
        targetPointer: '/body/id',
        sourceFormat: 'json',
        sourceText: '"0007"',
        ...(messageId === undefined ? {} : { messageId }),
      },
    ]);
    const model = literalGenerationModel(proposed);
    await assert.rejects(generateApiArguments({ ...source, model }));
    assert.equal(model.calls.length, 1);
  });

for (const messages of [
  [],
  [
    { id: 'x', text: 'one' },
    { id: 'x', text: 'two' },
  ],
  [{ id: '', text: 'text' }],
  [{ id: 'x', text: 5 }],
])
  test(`invalid explicit source list fails before model invocation: ${JSON.stringify(messages)}`, async () => {
    const source = await input();
    const model = literalGenerationModel(output());
    await assert.rejects(
      generateApiArguments({
        ...source,
        literalSourceMessages: messages,
        model,
      }),
      (error) => {
        assert.equal(error.diagnostic.stage, 'input-validation');
        return true;
      },
    );
    assert.equal(model.calls.length, 0);
  });

test('scenario-only quotes, OAS examples and partial JSON tokens are not original message evidence', async () => {
  for (const text of [
    '다른 상품을 조회해줘.',
    '"prefix-0007-suffix"',
    JSON.stringify({ request: '상품 "0007"' }),
  ]) {
    const source = await input();
    source.literalSourceMessages[0].text = text;
    await assert.rejects(
      generateApiArguments({
        ...source,
        model: literalGenerationModel(output()),
      }),
      (error) => {
        assert.equal(error.diagnostic.code, 'API_ARGUMENT_VALIDATION_FAILED');
        return true;
      },
    );
  }
});

test('a supplied empty source remains empty rather than falling back to scenario context', async () => {
  const source = await input();
  source.literalSourceMessages[0].text = '';
  await assert.rejects(
    generateApiArguments({
      ...source,
      model: literalGenerationModel(output()),
    }),
  );
});

test('source snapshots are independent and mutation while a model runs cannot change attribution', async () => {
  const source = await input();
  const captured = describeApiLiteralGeneration(source);
  source.literalSourceMessages[0].text = 'changed';
  assert.equal(
    captured.input.literalSourceMessages[0].text,
    '원문 상품 "0007"로 조회해줘.',
  );
  const original = await input();
  const model = literalGenerationModel(output(), () => {
    original.literalSourceMessages[0].id = 'changed';
  });
  await assert.rejects(
    generateApiArguments({ ...original, model }),
    /literalSourceMessages changed/,
  );
  assert.equal(model.calls.length, 1);
});

test('rejection feedback is bound to original message IDs and text, not only the formatted prompt', async () => {
  const source = await input();
  const invalid = output([
    {
      targetPointer: '/body/id',
      sourceFormat: 'json',
      sourceText: '"missing"',
    },
  ]);
  let failure;
  try {
    await generateApiArguments({
      ...source,
      model: literalGenerationModel(invalid),
    });
  } catch (error) {
    failure = error;
  }
  assert(failure);
  assert(createApiArgumentRejection({ ...source, error: failure }));
  for (const messages of [
    [{ id: 'another', text: source.literalSourceMessages[0].text }],
    [{ id: 'request', text: 'different' }],
  ])
    assert.equal(
      createApiArgumentRejection({
        ...source,
        literalSourceMessages: messages,
        error: failure,
      }),
      undefined,
    );
});

test('without explicit sources JSON scenario strings remain protected; no heuristic unwrapping is added', async () => {
  const source = await input();
  delete source.literalSourceMessages;
  await assert.rejects(
    generateApiArguments({
      ...source,
      trackRequestedInputs: true,
      model: literalGenerationModel(output()),
    }),
  );
});

test('fully confirmed inputs remain code-only even with explicit source messages', async () => {
  const source = await input();
  const model = literalGenerationModel(output());
  const result = await generateApiArguments({
    ...source,
    confirmedInputs: [
      {
        callId: source.callId,
        operation: source.operation.key,
        targetPointer: '/body/id',
        value: '0007',
      },
      {
        callId: source.callId,
        operation: source.operation.key,
        targetPointer: '/body/count',
        value: 0,
      },
    ],
    model,
  });
  assert.deepEqual(result.values, { body: { id: '0007', count: 0 } });
  assert.equal(model.calls.length, 0);
  assert.equal(result.literalGeneration.kind, 'not-needed');
});
