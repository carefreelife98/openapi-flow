import assert from 'node:assert/strict';
import test from 'node:test';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  describeApiBindingPlanning,
  createApiBindingPlanningRecord,
  validateApiBindingPlanningRecord,
} from '@openapi-flow/core';
import { planApiBindings, generateApiArguments } from '@openapi-flow/langchain';
import { bindingPlan, bind } from './fixtures/request-binding-fixture.mjs';
import {
  material,
  nativeOutputs,
  bindings,
} from './fixtures/native-output-binding-fixture.mjs';
import {
  bindingPlanningFixture,
  bindingPlanningModel,
  explainedBindingProposal,
} from './fixtures/binding-planning-record-fixture.mjs';

test('optional binding reasons cover every API instance including no binding, while original plan and contracts stay code-owned', async () => {
  const input = bindingPlanningFixture();
  const original = globalThis.structuredClone(input);
  const proposal = explainedBindingProposal();
  const model = bindingPlanningModel(
    proposal,
    ({ schema, options, messages }) => {
      assert.ok(messages[0] instanceof SystemMessage);
      assert.ok(messages[1] instanceof HumanMessage);
      assert.deepEqual(options, {
        name: 'plan_api_bindings',
        method: 'functionCalling',
        strict: true,
      });
      assert.deepEqual(schema.parse(proposal), proposal);
      const context = JSON.parse(messages[1].content);
      assert.deepEqual(context, describeApiBindingPlanning(input).context);
      assert.equal(Object.hasOwn(context, 'model'), false);
      assert.equal(context.materials[0].purpose, input.materials[0].purpose);
    },
  );
  const result = await planApiBindings({
    ...input,
    model,
    includeExplanations: true,
  });
  assert.equal(model.calls, 1);
  assert.deepEqual({ calls: result.calls, gaps: result.gaps }, bindingPlan);
  assert.equal(
    result.calls.some((call) => Object.hasOwn(call, 'reason')),
    false,
  );
  assert.deepEqual(result.bindingPlanning.calls, proposal.calls);
  assert.deepEqual(result.bindingPlanning.gaps, proposal.gaps);
  assert.deepEqual(
    result.bindingPlanning.evidence.context,
    describeApiBindingPlanning(input).context,
  );
  validateApiBindingPlanningRecord({
    ...input,
    plan: result,
    record: result.bindingPlanning,
  });
  assert.deepEqual(input, original);
});

test('disabled/omitted binding explanations retain the existing schema, values and one-call behavior', async () => {
  for (const flag of [undefined, false]) {
    const input = bindingPlanningFixture();
    const model = bindingPlanningModel(bindingPlan, ({ schema }) => {
      assert.equal(schema.safeParse(explainedBindingProposal()).success, false);
    });
    assert.deepEqual(
      await planApiBindings({ ...input, model, includeExplanations: flag }),
      bindingPlan,
    );
    assert.equal(model.calls, 1);
  }
});

test('native source contracts are preserved and resulting fully bound arguments need no value model or audit metadata', async () => {
  const input = {
    scenario: '원래 native 출력의 id를 상세 조회에 그대로 사용해줘.',
    materials: [globalThis.structuredClone(material)],
    nativeOutputs: globalThis.structuredClone(nativeOutputs),
  };
  const proposal = explainedBindingProposal({
    calls: [{ callId: material.callId, bindings }],
    gaps: [],
  });
  const result = await planApiBindings({
    ...input,
    model: bindingPlanningModel(proposal),
    includeExplanations: true,
  });
  assert.deepEqual(
    result.bindingPlanning.evidence.context.nativeOutputs,
    nativeOutputs,
  );
  const args = await generateApiArguments({
    ...material,
    scenario: input.scenario,
    bindings: result.calls[0].bindings,
  });
  assert.deepEqual(args.values, {});
  assert.deepEqual(args.unresolvedInputs, []);
  assert.equal(Object.hasOwn(args, 'bindingPlanning'), false);
  validateApiBindingPlanningRecord({
    ...input,
    plan: result,
    record: result.bindingPlanning,
  });
});

test('binding gaps preserve their existing descriptions and exact target rather than generating another explanation field', async () => {
  const input = bindingPlanningFixture();
  const plain = {
    calls: input.materials.map(({ callId }) => ({ callId, bindings: [] })),
    gaps: [
      {
        callId: 'detail',
        targetPointer: '/path/id',
        description: '사용자가 요구한 생산자가 제공된 계약에 없습니다.',
      },
    ],
  };
  const proposal = explainedBindingProposal(plain);
  const result = await planApiBindings({
    ...input,
    model: bindingPlanningModel(proposal),
    includeExplanations: true,
  });
  assert.deepEqual(result.gaps, plain.gaps);
  assert.deepEqual(result.bindingPlanning.gaps, plain.gaps);
  validateApiBindingPlanningRecord({
    ...input,
    plan: result,
    record: result.bindingPlanning,
  });
});

test('missing/blank/generated reason evidence and invalid pointers, call identities or cyclic plans fail without output repair or extra calls', async () => {
  for (const mutate of [
    (p) => delete p.calls[0].reason,
    (p) => (p.calls[0].reason = ' '),
    (p) => (p.calls[0].evidence = []),
    (p) => (p.evidence = []),
    (p) => (p.calls[1].bindings[0].reason = 'extra field'),
    (p) => (p.calls[1].bindings[0].sourceNodeId = 'absent'),
    (p) => (p.calls[1].bindings[0].sourcePointer = '/absent'),
    (p) => (p.calls[1].bindings[0].sourcePointer = '/labels'),
    (p) => (p.calls[1].bindings[0].sourceNodeId = 'summary'),
    (p) => p.calls.pop(),
    (p) => p.calls.push(globalThis.structuredClone(p.calls[0])),
    (p) =>
      p.gaps.push({
        callId: 'detail',
        targetPointer: '/path/absent',
        description: 'not declared',
      }),
  ]) {
    const proposal = explainedBindingProposal();
    mutate(proposal);
    const model = bindingPlanningModel(proposal);
    await assert.rejects(
      planApiBindings({
        ...bindingPlanningFixture(),
        model,
        includeExplanations: true,
      }),
    );
    assert.equal(model.calls, 1);
  }
});

test('invalid options, roles, original keys and colliding source identities fail before the model sees input', async () => {
  for (const mutate of [
    (p) => (p.includeExplanations = 'true'),
    (p) => (p.materials[0].purpose = ' '),
    (p) => delete p.materials[0].operation.key,
    (p) => delete p.materials[0].operation.operation,
    (p) => delete p.materials[0].operation.effective.parameters,
    (p) => (p.materials = []),
    (p) => p.materials.push(globalThis.structuredClone(p.materials[0])),
    (p) =>
      (p.nativeOutputs = [{ nodeId: p.materials[0].callId, schema: true }]),
    (p) => (p.nativeOutputs = null),
  ]) {
    const input = bindingPlanningFixture();
    mutate(input);
    const model = bindingPlanningModel(explainedBindingProposal());
    await assert.rejects(planApiBindings({ ...input, model }));
    assert.equal(model.calls, 0);
  }
});

test('caller mutation during await cannot replace the original scenario, role, key or nested API/native source contract', async () => {
  const input = {
    scenario: 'native id를 그대로 사용해줘.',
    materials: [globalThis.structuredClone(material)],
    nativeOutputs: globalThis.structuredClone(nativeOutputs),
  };
  input.materials[0].purpose = '원래 역할';
  const original = globalThis.structuredClone(input);
  const proposal = explainedBindingProposal({
    calls: [{ callId: material.callId, bindings }],
    gaps: [],
  });
  const model = bindingPlanningModel(proposal, () => {
    input.scenario = '다른 요청';
    input.materials[0].purpose = '다른 역할';
    input.materials[0].operation.key.snapshotId = 'other';
    input.nativeOutputs[0].schema.properties.id.type = 'number';
  });
  const result = await planApiBindings({
    ...input,
    model,
    includeExplanations: true,
  });
  validateApiBindingPlanningRecord({
    ...original,
    plan: result,
    record: result.bindingPlanning,
  });
  assert.throws(() =>
    validateApiBindingPlanningRecord({
      ...input,
      plan: result,
      record: result.bindingPlanning,
    }),
  );
});

test('record, execution plan and supplied sources have independent nested ownership', async () => {
  const input = bindingPlanningFixture();
  input.materials[0].unrelatedFunction = () => {};
  const described = describeApiBindingPlanning(input);
  assert.equal(
    Object.hasOwn(described.context.materials[0], 'unrelatedFunction'),
    false,
  );
  assert.equal(
    Object.hasOwn(described.input.materials[0], 'unrelatedFunction'),
    false,
  );
  const nativeDescription = describeApiBindingPlanning({
    ...input,
    nativeOutputs: [
      { nodeId: 'data-only-native', schema: true, unrelatedFunction: () => {} },
    ],
  });
  assert.deepEqual(nativeDescription.input.nativeOutputs, [
    { nodeId: 'data-only-native', schema: true },
  ]);
  assert.deepEqual(nativeDescription.context.nativeOutputs, [
    { nodeId: 'data-only-native', schema: true },
  ]);
  const output = explainedBindingProposal();
  const result = await planApiBindings({
    ...input,
    model: bindingPlanningModel(output),
    includeExplanations: true,
  });
  const before = globalThis.structuredClone(result.bindingPlanning);
  result.calls.find((x) => x.callId === 'detail').bindings[0].sourcePointer =
    '/changed';
  assert.deepEqual(result.bindingPlanning, before);
  described.input.materials[0].operation.key.snapshotId = 'changed';
  assert.notEqual(
    described.context.materials[0].operation.key.snapshotId,
    'changed',
  );
  assert.notEqual(input.materials[0].operation.key.snapshotId, 'changed');
});

test('record validation rejects stale contracts, roles, catalog data, source schemas and changed runtime bindings', async () => {
  const input = bindingPlanningFixture();
  input.nativeOutputs = [
    {
      nodeId: 'explicit-native',
      schema: { type: 'object', properties: { id: { type: 'string' } } },
    },
  ];
  const proposal = explainedBindingProposal();
  const result = await planApiBindings({
    ...input,
    model: bindingPlanningModel(proposal),
    includeExplanations: true,
  });
  for (const mutate of [
    (p) => (p.evidence.context.scenario = 'changed'),
    (p) => (p.evidence.context.materials[0].purpose = 'changed'),
    (p) =>
      (p.evidence.context.materials[0].operation.key.documentId = 'changed'),
    (p) => (p.evidence.context.materials[0].responsePointerCatalog = []),
    (p) =>
      (p.evidence.context.nativeOutputs[0].schema.properties.id.type =
        'number'),
    (p) =>
      (p.calls.find((x) => x.callId === 'detail').bindings[0].sourcePointer =
        '/changed'),
    (p) => (p.calls[0].reason = ' '),
    (p) => (p.calls[0].inventedEvidence = []),
    (p) =>
      p.gaps.push({
        callId: 'detail',
        targetPointer: '/path/id',
        description: 'new gap',
      }),
  ]) {
    const record = globalThis.structuredClone(result.bindingPlanning);
    mutate(record);
    assert.throws(() =>
      validateApiBindingPlanningRecord({ ...input, plan: result, record }),
    );
  }
  const changed = globalThis.structuredClone(result);
  changed.calls.find((x) => x.callId === 'detail').bindings = [
    bind('/path/id', 'stock', '/id'),
  ];
  assert.throws(() =>
    validateApiBindingPlanningRecord({
      ...input,
      plan: changed,
      record: result.bindingPlanning,
    }),
  );
});

test('code-owned construction requires exactly one supplied nonempty reason for each actual call decision', () => {
  const input = bindingPlanningFixture();
  const reasons = bindingPlan.calls.map(({ callId }) => ({
    callId,
    reason: '원래 계획 이유',
  }));
  const record = createApiBindingPlanningRecord({
    ...input,
    plan: bindingPlan,
    reasons,
  });
  validateApiBindingPlanningRecord({ ...input, plan: bindingPlan, record });
  for (const changed of [
    reasons.slice(1),
    [...reasons, reasons[0]],
    reasons.map((r, i) => (i === 0 ? { ...r, callId: 'absent' } : r)),
  ])
    assert.throws(() =>
      createApiBindingPlanningRecord({
        ...input,
        plan: bindingPlan,
        reasons: changed,
      }),
    );
});
