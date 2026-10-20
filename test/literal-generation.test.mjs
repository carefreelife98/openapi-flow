import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHttpRequestNodeConfiguration } from '../packages/n8n/dist/nodes/request/resolve-http-request-node-configuration.js';
import {
  createApiLiteralGenerationRecord,
  validateApiLiteralGenerationRecord,
  describeApiLiteralGeneration,
  applyConfirmedApiInputs,
} from '@openapi-flow/core';
import {
  generateApiArguments,
  planReviewableWorkflowGraph,
} from '@openapi-flow/langchain';
import {
  requestOperation,
  outputBinding,
  noInvocationModel,
} from './fixtures/api-argument-generation-fixture.mjs';
import {
  literalGenerationFixture,
  literalGenerationModel,
} from './fixtures/literal-generation-fixture.mjs';

test('same-call literal reason is attached only to the proposal, never attributed to merged confirmed inputs', async () => {
  const input = await literalGenerationFixture();
  const model = literalGenerationModel({
    values: { body: { quantity: 2 } },
    explanation: { reason: '첫 번째 역할의 수량 2를 사용했습니다.' },
  });
  const result = await generateApiArguments({
    ...input,
    model,
    includeExplanations: true,
  });
  assert.deepEqual(result.values, {
    body: { id: 'confirmed-original', quantity: 2 },
  });
  const record = result.literalGeneration;
  assert.equal(record.kind, 'proposed-literals');
  assert.deepEqual(record.proposedValues, { body: { quantity: 2 } });
  assert.equal(model.calls.length, 1);
  assert.equal(model.calls[0].options.method, 'functionCalling');
  assert.equal(model.calls[0].options.strict, undefined);
  assert.deepEqual(record.explanation.evidence[0], {
    kind: 'scenario',
    text: input.scenario,
    purpose: input.purpose,
  });
  assert.equal(model.calls[0].payload.purpose, input.purpose);
  assert.equal(
    JSON.stringify(record.explanation.evidence).includes('confirmed-original'),
    false,
  );
  assert.equal(
    JSON.stringify(model.calls[0].payload).includes(
      'Confirmed-input definition',
    ),
    false,
  );
  validateApiLiteralGenerationRecord({ ...input, record });
  const roundTrip = JSON.parse(JSON.stringify(record));
  validateApiLiteralGenerationRecord({ ...input, record: roundTrip });
});

test('literal types remain unchanged and OAS defaults do not fill absent values', async () => {
  const input = await literalGenerationFixture();
  const proposed = {
    body: { quantity: 2, enabled: false, notes: null, tags: ['a', 'b'] },
  };
  const result = await generateApiArguments({
    ...input,
    includeExplanations: true,
    model: literalGenerationModel({
      values: proposed,
      explanation: { reason: '명시된 값만 사용했습니다.' },
    }),
  });
  assert.deepEqual(result.literalGeneration.proposedValues, proposed);
  assert.equal(typeof result.values.body.quantity, 'number');
  assert.equal(result.values.body.enabled, false);
  assert.equal(result.values.body.notes, null);
  assert.deepEqual(result.values.body.tags, ['a', 'b']);
  const missing = await generateApiArguments({
    ...input,
    includeExplanations: true,
    model: literalGenerationModel({
      values: {},
      explanation: {
        reason: '이 역할에 사용할 수량을 아직 지정하지 않았습니다.',
      },
    }),
  });
  assert.deepEqual(missing.literalGeneration.proposedValues, {});
  assert.equal(Object.hasOwn(missing.values.body, 'quantity'), false);
  assert.deepEqual(missing.unresolvedInputs, ['/body/quantity']);
});

test('wholly bound or confirmed inputs skip the model and do not fabricate a proposal or model reason', async () => {
  const operation = await requestOperation({
    type: 'object',
    additionalProperties: false,
    properties: { quantity: { type: 'integer' } },
    required: ['quantity'],
  });
  for (const owner of ['binding', 'confirmed']) {
    const input = {
      callId: 'owned',
      operation,
      scenario: 'Use explicit input ownership.',
      requestMediaType: 'application/json',
      bindings: owner === 'binding' ? [outputBinding('/body/quantity')] : [],
      ...(owner === 'confirmed'
        ? {
            confirmedInputs: [
              {
                callId: 'owned',
                operation: operation.key,
                targetPointer: '/body/quantity',
                value: 4,
              },
            ],
          }
        : {}),
    };
    const result = await generateApiArguments({
      ...input,
      includeExplanations: true,
      model: noInvocationModel(),
    });
    assert.deepEqual(result.literalGeneration, {
      kind: 'not-needed',
      callId: 'owned',
      operation: operation.key,
    });
    assert.deepEqual(
      result.values,
      owner === 'binding' ? {} : { body: { quantity: 4 } },
    );
    validateApiLiteralGenerationRecord({
      ...input,
      record: result.literalGeneration,
    });
    assert.throws(
      () =>
        createApiLiteralGenerationRecord({
          ...input,
          proposal: { values: {} },
          reason: 'fabricated',
        }),
      /must be absent/,
    );
  }
});

test('disabled metadata preserves existing output shape and rejects an unrequested explanation', async () => {
  const input = await literalGenerationFixture();
  for (const includeExplanations of [undefined, false]) {
    const model = literalGenerationModel({ values: { body: { quantity: 2 } } });
    const result = await generateApiArguments({
      ...input,
      model,
      includeExplanations,
    });
    assert.equal(Object.hasOwn(result, 'literalGeneration'), false);
    assert.equal(
      model.calls[0].schema.safeParse({
        values: {},
        explanation: { reason: 'extra' },
      }).success,
      false,
    );
  }
});

test('enabled reasons cannot be missing/blank or contain generated sources, and invalid literal values are not repaired', async () => {
  const input = await literalGenerationFixture();
  for (const output of [
    { values: {} },
    { values: {}, explanation: { reason: '' } },
    { values: {}, explanation: { reason: ' ' } },
    { values: {}, explanation: { reason: 'why', evidence: [] } },
    {
      values: { body: { quantity: '2' } },
      explanation: { reason: 'wrong type' },
    },
    {
      values: { body: { id: 'overwrites-confirmed' } },
      explanation: { reason: 'wrong owner' },
    },
  ]) {
    const model = literalGenerationModel(output);
    await assert.rejects(
      generateApiArguments({ ...input, model, includeExplanations: true }),
    );
    assert.equal(model.calls.length, 1);
  }
});

test('invalid options and supplied blank role fail before invocation; absent role is not inferred', async () => {
  const input = await literalGenerationFixture();
  const model = literalGenerationModel({ values: { body: { quantity: 2 } } });
  await assert.rejects(
    generateApiArguments({ ...input, model, includeExplanations: 'true' }),
  );
  await assert.rejects(
    generateApiArguments({ ...input, model, purpose: ' ' }),
    /purpose/,
  );
  assert.equal(model.calls.length, 0);
  const withoutRole = globalThis.structuredClone(input);
  delete withoutRole.purpose;
  await generateApiArguments({ ...withoutRole, model });
  assert.equal(Object.hasOwn(model.calls[0].payload, 'purpose'), false);
});

test('mutating the caller during invocation cannot replace confirmed values, binding identity or original contracts', async () => {
  for (const includeExplanations of [false, true]) {
    const input = await literalGenerationFixture();
    const before = globalThis.structuredClone(input);
    const model = literalGenerationModel(
      {
        values: { body: { quantity: 2 } },
        ...(includeExplanations
          ? { explanation: { reason: 'original snapshot' } }
          : {}),
      },
      () => {
        input.confirmedInputs[0].value = 'mutated-confirmed';
        input.operation.key.snapshotId = 'changed';
        input.bindings.push(outputBinding('/body/quantity'));
        input.purpose = 'changed role';
      },
    );
    const result = await generateApiArguments({
      ...input,
      model,
      includeExplanations,
    });
    assert.deepEqual(result.values, {
      body: { id: 'confirmed-original', quantity: 2 },
    });
    assert.deepEqual(result.bindings, []);
    if (includeExplanations)
      validateApiLiteralGenerationRecord({
        ...before,
        record: result.literalGeneration,
      });
  }
});

test('source contracts and proposal objects are deep independent snapshots', async () => {
  const input = await literalGenerationFixture();
  const description = describeApiLiteralGeneration(input);
  description.input.confirmedInputs[0].value = 'only-copy';
  description.context.literalInputSchema.properties.values = false;
  assert.equal(input.confirmedInputs[0].value, 'confirmed-original');
  const proposal = { values: { body: { quantity: 2, tags: ['original'] } } };
  const record = createApiLiteralGenerationRecord({
    ...input,
    proposal,
    reason: 'original',
  });
  proposal.values.body.tags[0] = 'changed';
  assert.deepEqual(record.proposedValues.body.tags, ['original']);
});

test('record verification rejects stale call/key/role/projection, new ownership and invented merged values', async () => {
  const input = await literalGenerationFixture();
  const record = createApiLiteralGenerationRecord({
    ...input,
    proposal: { values: { body: { quantity: 2 } } },
    reason: 'original',
  });
  for (const change of [
    (copy) => {
      copy.callId = 'wrong-role';
    },
    (copy) => {
      copy.operation.snapshotId = 'stale';
    },
    (copy) => {
      copy.explanation.evidence[0].purpose = 'wrong role';
    },
    (copy) => {
      copy.explanation.evidence[0].text = 'fabricated';
    },
    (copy) => {
      copy.explanation.evidence[1].schema.properties.values = false;
    },
    (copy) => {
      copy.proposedValues.body.id = 'confirmed-original';
    },
  ]) {
    const copy = globalThis.structuredClone(record);
    change(copy);
    assert.throws(() =>
      validateApiLiteralGenerationRecord({ ...input, record: copy }),
    );
  }
  assert.throws(() =>
    validateApiLiteralGenerationRecord({
      ...input,
      bindings: [outputBinding('/body/quantity')],
      record,
    }),
  );
});

test('later confirmed answers preserve the historical proposal without assigning the human value to the model', async () => {
  const input = await literalGenerationFixture();
  const result = await generateApiArguments({
    ...input,
    includeExplanations: true,
    model: literalGenerationModel({
      values: {},
      explanation: { reason: 'No literal quantity supplied yet.' },
    }),
  });
  const before = globalThis.structuredClone(result.literalGeneration);
  const values = applyConfirmedApiInputs({
    operation: input.operation,
    callId: input.callId,
    bindings: input.bindings,
    requestMediaType: input.requestMediaType,
    values: result.values,
    confirmedInputs: [
      {
        callId: input.callId,
        operation: input.operation.key,
        targetPointer: '/body/quantity',
        value: 5,
      },
    ],
  });
  const updated = { ...result, values };
  assert.equal(updated.values.body.quantity, 5);
  assert.deepEqual(updated.literalGeneration, before);
  assert.deepEqual(updated.literalGeneration.proposedValues, {});
  validateApiLiteralGenerationRecord({
    ...input,
    record: updated.literalGeneration,
  });
});

test('graph orchestration gets actual request values and role, not duplicated literal audit schemas/reasons', async () => {
  const input = await literalGenerationFixture();
  const args = await generateApiArguments({
    ...input,
    includeExplanations: true,
    model: literalGenerationModel({
      values: { body: { quantity: 2 } },
      explanation: { reason: 'argument-stage-only-reason' },
    }),
  });
  const model = {
    withStructuredOutput() {
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          assert.equal(payload.materials[0].purpose, input.purpose);
          assert.deepEqual(payload.materials[0].arguments.values, args.values);
          assert.equal(
            Object.hasOwn(payload.materials[0].arguments, 'literalGeneration'),
            false,
          );
          assert.equal(
            JSON.stringify(payload).includes('argument-stage-only-reason'),
            false,
          );
          return {
            edges: [],
            additionalGaps: [],
            blockedCalls: [],
          };
        },
      };
    },
  };
  const plan = await planReviewableWorkflowGraph({
    planId: 'literal-audit-graph',
    scenario: input.scenario,
    model,
    materials: [
      {
        status: 'ready',
        operation: input.operation,
        arguments: args,
        purpose: input.purpose,
      },
    ],
    capabilities: [],
    gaps: [],
  });
  assert.equal(plan.gaps.length, 0);
  assert.equal(
    args.literalGeneration.explanation.reason,
    'argument-stage-only-reason',
  );
});

test('n8n materialization config contains executable arguments only, never the literal audit/scenario', async () => {
  const input = await literalGenerationFixture();
  input.bindings = [outputBinding('/body/enabled')];
  const args = await generateApiArguments({
    ...input,
    includeExplanations: true,
    model: literalGenerationModel({
      values: { body: { quantity: 2 } },
      explanation: { reason: 'private-argument-audit-marker' },
    }),
  });
  const prepared = resolveHttpRequestNodeConfiguration({
    operation: input.operation,
    arguments: args,
    baseUrl: 'https://example.test',
    credentialBindings: {},
    position: [0, 0],
  });
  assert.deepEqual(prepared.config.arguments.values, args.values);
  assert.deepEqual(prepared.config.arguments.bindings, args.bindings);
  assert.equal(
    Object.hasOwn(prepared.config.arguments, 'literalGeneration'),
    false,
  );
  assert.equal(
    JSON.stringify(prepared.config).includes('private-argument-audit-marker'),
    false,
  );
  assert.equal(
    args.literalGeneration.explanation.reason,
    'private-argument-audit-marker',
  );
});

test('model is unnecessary for code-only generation, but missing/invalid models fail before a literal call', async () => {
  const operation = await requestOperation({
    type: 'object',
    additionalProperties: false,
    required: ['quantity'],
    properties: { quantity: { type: 'integer' } },
  });
  const input = {
    callId: 'no-model',
    operation,
    requestMediaType: 'application/json',
    bindings: [outputBinding('/body/quantity')],
    scenario: 'Use only the declared binding.',
  };
  const result = await generateApiArguments({
    ...input,
    includeExplanations: true,
  });
  assert.equal(result.literalGeneration.kind, 'not-needed');
  assert.deepEqual(result.values, {});
  await assert.rejects(
    generateApiArguments({ ...input, bindings: [] }),
    /model.*literal inputs remain/,
  );
  await assert.rejects(
    generateApiArguments({ ...input, model: {} }),
    /model.*when supplied/,
  );
});
