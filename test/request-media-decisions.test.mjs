import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeApiRequestMediaTypeContext,
  createApiRequestMediaTypeDecision,
  validateApiRequestMediaTypeDecision,
} from '@openapi-flow/core';
import {
  analyzeApiRequestMediaType,
  selectApiRequestMediaType,
} from '@openapi-flow/langchain';
import {
  requestMediaDecisionFixture,
  requestMediaDecisionModel,
} from './fixtures/request-media-decisions-fixture.mjs';

test('code-owned zero/one-format decisions have no assessment, reason or model call', async () => {
  const f = await requestMediaDecisionFixture(['application/json']);
  const model = requestMediaDecisionModel({ requestMediaType: 'invalid' });
  for (const hasBody of [false, true]) {
    const { operation } = await requestMediaDecisionFixture(
      hasBody ? ['application/json'] : null,
    );
    const result = await analyzeApiRequestMediaType({
      ...f,
      operation,
      model,
      includeExplanations: true,
    });
    assert.equal(
      result.kind,
      hasBody ? 'single-declared-format' : 'no-request-body',
    );
    assert.equal(
      result.requestMediaType,
      hasBody ? 'application/json' : undefined,
    );
    assert.equal(Object.hasOwn(result, 'assessment'), false);
    validateApiRequestMediaTypeDecision({ ...f, operation, decision: result });
    assert.throws(
      () =>
        createApiRequestMediaTypeDecision({
          ...f,
          operation,
          assessment: { requestMediaType: null },
        }),
      /assessment must be absent/,
    );
  }
  assert.equal(model.calls.length, 0);
});

test('explicit format assessment retains the selected value and code-owned exact scenario/OAS sources', async () => {
  const f = await requestMediaDecisionFixture();
  const model = requestMediaDecisionModel({
    requestMediaType: 'application/x-www-form-urlencoded',
    explanation: { reason: 'フォーム形式が明示されています。' },
  });
  const result = await analyzeApiRequestMediaType({
    ...f,
    model,
    includeExplanations: true,
  });
  assert.equal(result.kind, 'model-selection');
  assert.equal(result.requestMediaType, 'application/x-www-form-urlencoded');
  assert.equal(model.calls.length, 1);
  assert.equal(model.calls[0].options.method, 'functionCalling');
  assert.equal(model.calls[0].options.strict, true);
  assert.deepEqual(result.assessment.explanation.evidence, [
    { kind: 'scenario', text: f.scenario },
    {
      kind: 'oas-request-body',
      operation: f.operation.key,
      pointer: '/requestBody',
      value: f.operation.operation.requestBody,
    },
  ]);
  validateApiRequestMediaTypeDecision({ ...f, decision: result });
});

test('explicit null is a model assessment, while the final JSON choice belongs to the documented code policy', async () => {
  const f = await requestMediaDecisionFixture();
  const model = requestMediaDecisionModel({
    requestMediaType: null,
    explanation: { reason: '형식을 지정하지 않았습니다.' },
  });
  const result = await analyzeApiRequestMediaType({
    ...f,
    model,
    includeExplanations: true,
  });
  assert.equal(result.kind, 'documented-default');
  assert.equal(result.assessment.requestMediaType, null);
  assert.equal(result.requestMediaType, 'application/json');
  assert.equal(result.policy, 'json-form-concrete-wildcard-code-point');
  assert.equal(
    result.assessment.explanation.reason,
    '형식을 지정하지 않았습니다.',
  );
  assert.deepEqual(result.declaredMediaTypes, [
    'application/x-www-form-urlencoded',
    'application/json',
  ]);
  validateApiRequestMediaTypeDecision({ ...f, decision: result });
});

test('default resolution uses the existing declared-only priority and code-point tie break, not insertion order', async () => {
  for (const [formats, expected] of [
    [['application/xml', 'text/plain', '*/*'], 'application/xml'],
    [['*/*', 'text/plain', 'application/xml'], 'application/xml'],
    [
      ['text/plain', 'application/x-www-form-urlencoded'],
      'application/x-www-form-urlencoded',
    ],
    [['text/*', 'application/*'], 'application/*'],
  ]) {
    const f = await requestMediaDecisionFixture(formats);
    const result = createApiRequestMediaTypeDecision({
      ...f,
      assessment: { requestMediaType: null },
    });
    assert.equal(result.requestMediaType, expected);
    validateApiRequestMediaTypeDecision({ ...f, decision: result });
  }
});

test('invalid/missing output never activates the default and is not retried or repaired', async () => {
  const f = await requestMediaDecisionFixture();
  for (const output of [
    {},
    { requestMediaType: undefined },
    { requestMediaType: 'application/xml' },
    { requestMediaType: '' },
    { requestMediaType: 1 },
  ]) {
    const model = requestMediaDecisionModel(output);
    await assert.rejects(analyzeApiRequestMediaType({ ...f, model }));
    assert.equal(model.calls.length, 1);
  }
  assert.throws(
    () => createApiRequestMediaTypeDecision(f),
    /requires an explicit request media assessment/,
  );
  assert.throws(
    () =>
      createApiRequestMediaTypeDecision({
        ...f,
        assessment: { requestMediaType: 'application/xml' },
      }),
    /not a declared/,
  );
});

test('enabled explanations require a nonempty reason and reject model-generated evidence', async () => {
  const f = await requestMediaDecisionFixture();
  for (const explanation of [
    undefined,
    null,
    {},
    { reason: '' },
    { reason: ' ' },
    { reason: 'why', evidence: [] },
  ]) {
    const model = requestMediaDecisionModel({
      requestMediaType: null,
      ...(explanation === undefined ? {} : { explanation }),
    });
    await assert.rejects(
      analyzeApiRequestMediaType({ ...f, model, includeExplanations: true }),
      /model API request media type is invalid/,
    );
    assert.equal(model.calls.length, 1);
  }
});

test('disabled explanation fields are absent, and the original selector retains its string-only contract', async () => {
  const f = await requestMediaDecisionFixture();
  for (const enabled of [undefined, false]) {
    const model = requestMediaDecisionModel({
      requestMediaType: 'application/json',
    });
    const result = await analyzeApiRequestMediaType({
      ...f,
      model,
      includeExplanations: enabled,
    });
    assert.equal(
      Object.hasOwn(model.calls[0].schema.shape, 'explanation'),
      false,
    );
    assert.equal(Object.hasOwn(result.assessment, 'explanation'), false);
  }
  assert.equal(
    await selectApiRequestMediaType({
      ...f,
      model: requestMediaDecisionModel({ requestMediaType: null }),
    }),
    'application/json',
  );
});

test('invalid settings or an empty content map fail before a model call', async () => {
  const f = await requestMediaDecisionFixture();
  const model = requestMediaDecisionModel({ requestMediaType: null });
  await assert.rejects(
    analyzeApiRequestMediaType({ ...f, model, includeExplanations: 'true' }),
  );
  f.operation.operation.requestBody.content = {};
  await assert.rejects(
    analyzeApiRequestMediaType({ ...f, model }),
    /requestBody.content has no request media type/,
  );
  assert.equal(model.calls.length, 0);
});

test('nested source snapshots are independent of caller changes during the model call', async () => {
  const f = await requestMediaDecisionFixture();
  const original = globalThis.structuredClone(f.operation);
  const snapshot = describeApiRequestMediaTypeContext(f);
  snapshot.operation.requestBody.content[
    'application/json'
  ].schema.properties.count.minimum = 99;
  assert.equal(
    f.operation.operation.requestBody.content['application/json'].schema
      .properties.count.minimum,
    1,
  );
  const model = requestMediaDecisionModel(
    { requestMediaType: null, explanation: { reason: '미지정' } },
    () => {
      f.operation.key.snapshotId = 'changed';
      f.operation.operation.requestBody.content[
        'application/json'
      ].schema.properties.count.minimum = 99;
    },
  );
  const result = await analyzeApiRequestMediaType({
    ...f,
    model,
    includeExplanations: true,
  });
  assert.deepEqual(result.operation, original.key);
  assert.deepEqual(
    result.assessment.explanation.evidence[1].value,
    original.operation.requestBody,
  );
  validateApiRequestMediaTypeDecision({
    operation: original,
    scenario: f.scenario,
    decision: result,
  });
});

test('record verification rejects stale identity, changed evidence, fabricated choice and changed policy', async () => {
  const f = await requestMediaDecisionFixture();
  const decision = createApiRequestMediaTypeDecision({
    ...f,
    assessment: { requestMediaType: null, explanation: { reason: '미지정' } },
  });
  for (const change of [
    (value) => {
      value.operation.snapshotId = 'stale';
    },
    (value) => {
      value.requestMediaType = 'application/x-www-form-urlencoded';
    },
    (value) => {
      value.policy = 'guessed-policy';
    },
    (value) => {
      value.declaredMediaTypes.reverse();
    },
    (value) => {
      value.assessment.explanation.evidence[0].text = 'fabricated';
    },
    (value) => {
      value.assessment.explanation.evidence[1].value.required = false;
    },
    (value) => {
      value.assessment.requestMediaType = 'application/json';
    },
  ]) {
    const copy = globalThis.structuredClone(decision);
    change(copy);
    assert.throws(() =>
      validateApiRequestMediaTypeDecision({ ...f, decision: copy }),
    );
  }
});
