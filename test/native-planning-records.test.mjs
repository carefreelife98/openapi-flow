import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { planNativeNodes } from '@openapi-flow/langchain';
import {
  describeNativeNodePlanning,
  createNativeNodePlan,
  createNativeNodePlanningRecord,
  validateNativeNodePlanningRecord,
} from '@openapi-flow/core';
import { createN8nNativeCapabilities } from '@openapi-flow/n8n';
import { material } from './fixtures/native-output-binding-fixture.mjs';
import {
  nativePlanningRecordFixture,
  nativePlanningRecordModel,
} from './fixtures/native-planning-record-fixture.mjs';

test('per-instance reasons remain separate from typed native values and code derives actual prepared/new contracts', async () => {
  const { input, nodes, explained } = nativePlanningRecordFixture();
  const model = nativePlanningRecordModel(
    explained,
    ({ messages, options, schema }) => {
      assert.ok(messages[0] instanceof SystemMessage);
      assert.ok(messages[1] instanceof HumanMessage);
      assert.deepEqual(options, {
        name: 'plan_native_nodes',
        method: 'functionCalling',
        strict: true,
      });
      assert.deepEqual(
        JSON.parse(messages[1].content),
        describeNativeNodePlanning(input).context,
      );
      assert.ok(schema.properties.decision);
      assert.equal(schema.properties.nativeNodes, undefined);
    },
  );
  const result = await planNativeNodes({
    ...input,
    model,
    includeExplanations: true,
  });
  assert.equal(model.calls, 1);
  assert.deepEqual(result.nativeNodes, nodes);
  assert.deepEqual(result.gaps, []);
  assert.equal(result.nativePlanning.kind, 'model-plan');
  assert.equal(result.nativePlanning.assessment.kind, 'additions');
  assert.equal(result.nativePlanning.assessment.nodes.length, 2);
  assert.deepEqual(
    result.nativePlanning.verification.contracts.map((x) => x.id),
    nodes.map((x) => x.id),
  );
  assert.equal(result.nativePlanning.verification.outputs.length, 2);
  assert.equal(result.nativeNodes[0].parameters.count, 0);
  assert.equal(result.nativeNodes[0].parameters.enabled, false);
  assert.equal(
    result.nativePlanning.evidence.context.capabilities[0].parametersSchema
      .properties.count.type,
    'integer',
  );
  assert.equal(JSON.stringify(result.nativeNodes).includes('reason'), false);
  validateNativeNodePlanningRecord({
    ...input,
    plan: result,
    record: result.nativePlanning,
  });
  validateNativeNodePlanningRecord({
    ...input,
    plan: result,
    record: JSON.parse(JSON.stringify(result.nativePlanning)),
  });
});

test('a no-additions decision has an explicit reason and code derives the empty node list and review gap identities', async () => {
  const { input } = nativePlanningRecordFixture();
  const output = {
    decision: {
      noAdditionalNodesReason:
        '제공된 기능으로 요청한 알림을 구현할 수 없습니다.',
      gaps: [{ description: '요청한 알림 기능이 제공되지 않았습니다.' }],
    },
  };
  const result = await planNativeNodes({
    ...input,
    model: nativePlanningRecordModel(output),
    includeExplanations: true,
  });
  assert.deepEqual(result.nativeNodes, []);
  assert.deepEqual(result.gaps, [
    {
      id: input.planId + '-gap-1',
      stage: 'workflow-graph',
      description: output.decision.gaps[0].description,
    },
  ]);
  assert.equal(result.nativePlanning.assessment.kind, 'no-additions');
  assert.equal(
    result.nativePlanning.assessment.reason,
    output.decision.noAdditionalNodesReason,
  );
  validateNativeNodePlanningRecord({
    ...input,
    plan: result,
    record: result.nativePlanning,
  });
});

test('no offered capability is code-only, needs no model and never fabricates a model assessment', async () => {
  for (const capabilities of [undefined, []]) {
    const input = {
      planId: 'empty',
      scenario: '제공된 재료만 사용해줘.',
      capabilities,
      includeExplanations: true,
    };
    const result = await planNativeNodes(input);
    assert.deepEqual(result.nativeNodes, []);
    assert.deepEqual(result.gaps, []);
    assert.equal(result.nativePlanning.kind, 'no-capabilities');
    assert.equal(Object.hasOwn(result.nativePlanning, 'assessment'), false);
    validateNativeNodePlanningRecord({
      ...input,
      plan: result,
      record: result.nativePlanning,
    });
    assert.deepEqual(
      await planNativeNodes({ ...input, includeExplanations: false }),
      { nativeNodes: [], gaps: [] },
    );
  }
});

test('prepared instances are immutable host materials, never model additions or generated values', async () => {
  const fixture = nativePlanningRecordFixture();
  fixture.nodes[0].runtimeParameters = undefined;
  const input = { ...fixture.input, preparedNativeNodes: fixture.nodes };
  const original = globalThis.structuredClone(fixture.nodes);
  const result = await planNativeNodes({
    ...input,
    model: nativePlanningRecordModel({
      decision: {
        noAdditionalNodesReason: '준비된 두 노드가 이미 요청을 충족합니다.',
        gaps: [],
      },
    }),
    includeExplanations: true,
  });
  assert.deepEqual(result.nativeNodes, []);
  assert.deepEqual(input.preparedNativeNodes, original);
  assert.equal(result.nativePlanning.verification.contracts.length, 2);
  assert.equal(result.nativePlanning.verification.outputs.length, 2);
  validateNativeNodePlanningRecord({
    ...input,
    plan: result,
    record: JSON.parse(JSON.stringify(result.nativePlanning)),
  });
  const repeated = {
    decision: {
      additions: [fixture.explained.decision.additions[0]],
      gaps: [],
    },
  };
  await assert.rejects(
    planNativeNodes({
      ...input,
      model: nativePlanningRecordModel(repeated),
      includeExplanations: true,
    }),
    (error) => {
      assert.equal(error.failure.stage, 'node-validation');
      assert.deepEqual(error.failure.sourceOutput, repeated);
      assert.match(error.cause.message, /duplicates preparedNativeNodes/);
      return true;
    },
  );
});

test('omitted/disabled explanations keep the original nativeNodes/gaps wire and return shape', async () => {
  const { input, nodes } = nativePlanningRecordFixture();
  for (const enabled of [undefined, false]) {
    const output = { nativeNodes: nodes, gaps: [] };
    const model = nativePlanningRecordModel(output, ({ schema }) => {
      assert.ok(schema.properties.nativeNodes);
      assert.equal(schema.properties.decision, undefined);
    });
    assert.deepEqual(
      await planNativeNodes({ ...input, model, includeExplanations: enabled }),
      output,
    );
    assert.equal(model.calls, 1);
  }
});

test('missing/blank reasons, empty additions, generated evidence/ports and cross-mode aliases fail without repair or retry', async () => {
  for (const change of [
    (p) => delete p.decision.additions[0].reason,
    (p) => (p.decision.additions[0].reason = ' '),
    (p) => (p.decision.additions = []),
    (p) => (p.decision.additions[0].evidence = []),
    (p) => (p.decision.additions[0].node.inputPorts = ['main']),
    (p) => (p.decision.additions[0].node.parameters.count = '0'),
    (p) => (p.decision.additions[0].node.parameters.enabled = 'false'),
    (p) => p.decision.gaps.push({ description: ' ' }),
    (p) => (p.decision.noAdditionalNodesReason = 'both choices are invalid'),
  ]) {
    const { input, explained } = nativePlanningRecordFixture();
    change(explained);
    const original = globalThis.structuredClone(explained),
      model = nativePlanningRecordModel(explained);
    await assert.rejects(
      planNativeNodes({ ...input, model, includeExplanations: true }),
      (error) => {
        assert.equal(error.failure.stage, 'proposal-schema');
        assert.deepEqual(error.failure.output, original);
        assert.ok(error.cause instanceof Error);
        return true;
      },
    );
    assert.equal(model.calls, 1);
    assert.deepEqual(explained, original);
  }
  const { input, nodes, explained } = nativePlanningRecordFixture();
  await assert.rejects(
    planNativeNodes({
      ...input,
      model: nativePlanningRecordModel({ nativeNodes: nodes, gaps: [] }),
      includeExplanations: true,
    }),
  );
  await assert.rejects(
    planNativeNodes({ ...input, model: nativePlanningRecordModel(explained) }),
  );
});

test('invalid input options, registry, original API contract or missing model fail at the source boundary', async () => {
  for (const change of [
    (p) => (p.includeExplanations = 'true'),
    (p) => (p.allowRuntimeParameters = 'true'),
    (p) => (p.capabilities = null),
    (p) => p.capabilities.push(p.capabilities[0]),
    (p) => (p.capabilities[0].inputPorts = undefined),
    (p) => (p.capabilities[0].parametersSchema = undefined),
    (p) => (p.apiMaterials = [{ callId: 'bad', operation: {} }]),
    (p) => (p.preparedNativeNodes = null),
  ]) {
    const { input, explained } = nativePlanningRecordFixture();
    change(input);
    const model = nativePlanningRecordModel(explained);
    await assert.rejects(planNativeNodes({ ...input, model }));
    assert.equal(model.calls, 0);
  }
  const { input } = nativePlanningRecordFixture();
  await assert.rejects(planNativeNodes(input), /model is required/);
  await assert.rejects(
    planNativeNodes({ planId: 'empty', scenario: 'valid', model: {} }),
    /model must support/,
  );
});

test('runtime parameter ownership is explicit and never manufactures a literal value or slot identity', async () => {
  const { input } = nativePlanningRecordFixture();
  const node = {
    id: 'runtime-context',
    capability: input.capabilities[0].name,
    parameters: {},
    runtimeParameters: true,
  };
  const output = {
    decision: {
      additions: [
        {
          node: {
            id: node.id,
            capability: node.capability,
            parameterSource: 'workflow-input',
          },
          reason: '실행 시 전체 입력값이 필요합니다.',
        },
      ],
      gaps: [],
    },
  };
  const result = await planNativeNodes({
    ...input,
    allowRuntimeParameters: true,
    model: nativePlanningRecordModel(output),
    includeExplanations: true,
  });
  assert.deepEqual(result.nativeNodes, [node]);
  assert.deepEqual(
    result.nativePlanning.evidence.context.capabilities[0].parameterSources,
    ['literal', 'workflow-input'],
  );
  assert.equal(Object.hasOwn(result.nativePlanning, 'slotId'), false);
  assert.equal(
    result.nativePlanning.verification.outputs[0].schema.properties.count.type,
    'integer',
  );
  validateNativeNodePlanningRecord({
    ...input,
    allowRuntimeParameters: true,
    plan: result,
    record: result.nativePlanning,
  });
  await assert.rejects(
    planNativeNodes({
      ...input,
      model: nativePlanningRecordModel(output),
      includeExplanations: true,
    }),
  );
  assert.throws(
    () =>
      createNativeNodePlan({
        ...input,
        proposal: { nativeNodes: [node], gaps: [] },
      }),
    /runtime parameters were not enabled/,
  );
});

test('explained native references remain constrained to supplied original API instances', async () => {
  const capability = createN8nNativeCapabilities().find(
    (c) => c.name === 'assert-responses',
  );
  const input = {
    planId: 'reference',
    scenario: '선택된 원래 API 응답의 result가 1인지 확인해줘.',
    capabilities: [capability],
    apiMaterials: [{ ...material, purpose: '원래 상세 API' }],
  };
  const node = {
    id: 'check',
    capability: capability.name,
    parameters: {
      checks: [
        {
          left: {
            source: 'response',
            nodeId: material.callId,
            pointer: '/result',
          },
          operator: 'equals',
          right: { source: 'literal', value: 1 },
          message: '불일치',
        },
      ],
    },
  };
  const output = {
    decision: {
      additions: [{ node, reason: '요청한 응답 비교를 수행합니다.' }],
      gaps: [],
    },
  };
  const result = await planNativeNodes({
    ...input,
    model: nativePlanningRecordModel(output),
    includeExplanations: true,
  });
  validateNativeNodePlanningRecord({
    ...input,
    plan: result,
    record: result.nativePlanning,
  });
  assert.equal(
    result.nativePlanning.evidence.context.apiMaterials[0].purpose,
    input.apiMaterials[0].purpose,
  );
  const invalid = globalThis.structuredClone(output);
  invalid.decision.additions[0].node.parameters.checks[0].left.nodeId =
    'unavailable-api';
  await assert.rejects(
    planNativeNodes({
      ...input,
      model: nativePlanningRecordModel(invalid),
      includeExplanations: true,
    }),
    (error) => error.failure.stage === 'proposal-schema',
  );
});

test('parameter ownership is an explicit model choice; runtime constants are code-owned and marker-like literal strings are never reinterpreted', async () => {
  const { input, nodes } = nativePlanningRecordFixture();
  const literal = {
    id: 'owned-literal',
    capability: input.capabilities[0].name,
    parameterSource: 'literal',
    parameters: {
      ...nodes[0].parameters,
      id: '__runtime__',
      marker: '__runtime__',
    },
  };
  const output = { nativeNodes: [literal], gaps: [] };
  const result = await planNativeNodes({
    ...input,
    allowRuntimeParameters: true,
    model: nativePlanningRecordModel(output),
  });
  assert.deepEqual(result.nativeNodes, [
    {
      id: literal.id,
      capability: literal.capability,
      parameters: literal.parameters,
    },
  ]);
  assert.equal(
    Object.hasOwn(result.nativeNodes[0], 'runtimeParameters'),
    false,
  );
  for (const node of [
    {
      id: literal.id,
      capability: literal.capability,
      parameters: literal.parameters,
    },
    {
      id: literal.id,
      capability: literal.capability,
      parameterSource: 'workflow-input',
      parameters: {},
    },
    {
      id: literal.id,
      capability: literal.capability,
      parameters: {},
      runtimeParameters: true,
    },
  ]) {
    const model = nativePlanningRecordModel({ nativeNodes: [node], gaps: [] });
    await assert.rejects(
      planNativeNodes({ ...input, allowRuntimeParameters: true, model }),
      (error) => error.failure.stage === 'proposal-schema',
    );
    assert.equal(model.calls, 1);
  }
});

test('await-time mutation of caller data and registry fields cannot rewrite captured prepared/API values or original implementation selection', async () => {
  const { input, nodes } = nativePlanningRecordFixture();
  input.apiMaterials = [
    { ...globalThis.structuredClone(material), purpose: '원래 역할' },
  ];
  input.preparedNativeNodes = [nodes[0]];
  const original = {
    ...input,
    apiMaterials: globalThis.structuredClone(input.apiMaterials),
    preparedNativeNodes: globalThis.structuredClone(input.preparedNativeNodes),
    capabilities: input.capabilities.map((c) => ({ ...c })),
  };
  const output = {
    decision: { noAdditionalNodesReason: '준비된 값을 유지합니다.', gaps: [] },
  };
  const model = nativePlanningRecordModel(output, () => {
    input.apiMaterials[0].operation.key.snapshotId = 'changed';
    input.apiMaterials[0].purpose = 'changed';
    input.preparedNativeNodes[0].parameters.count = 77;
    input.capabilities[0].description = 'changed';
    input.capabilities[0].parametersSchema = z.strictObject({
      other: z.string(),
    });
  });
  const result = await planNativeNodes({
    ...input,
    model,
    includeExplanations: true,
  });
  validateNativeNodePlanningRecord({
    ...original,
    plan: result,
    record: result.nativePlanning,
  });
  assert.equal(
    result.nativePlanning.evidence.context.preparedNativeNodes[0].parameters
      .count,
    0,
  );
  assert.throws(() =>
    validateNativeNodePlanningRecord({
      ...input,
      plan: result,
      record: result.nativePlanning,
    }),
  );
});

test('a changing serialized planning contract fails visibly instead of validating against a silently changed schema', async () => {
  const { input, explained } = nativePlanningRecordFixture();
  const original = input.capabilities[0].parametersSchema;
  let changed = false;
  input.capabilities[0].createPlanningParametersSchema = () =>
    changed ? z.strictObject({ different: z.string() }) : original;
  await assert.rejects(
    planNativeNodes({
      ...input,
      includeExplanations: true,
      model: nativePlanningRecordModel(explained, () => {
        changed = true;
      }),
    }),
    (error) => {
      assert.equal(error.failure.stage, 'node-validation');
      assert.deepEqual(error.failure.sourceOutput, explained);
      assert.match(error.cause.message, /source contracts changed/);
      return true;
    },
  );
});

test('records and source/result nested data have independent ownership and tampered contracts, decisions or verification receipts are rejected', async () => {
  const { input, explained } = nativePlanningRecordFixture();
  const result = await planNativeNodes({
    ...input,
    model: nativePlanningRecordModel(explained),
    includeExplanations: true,
  });
  for (const change of [
    (p) => (p.plan.nativeNodes[0].parameters.count = 8),
    (p) => (p.planId = 'other'),
    (p) => (p.evidence.context.scenario = 'other'),
    (p) =>
      (p.evidence.context.capabilities[0].parametersSchema.properties.count.type =
        'string'),
    (p) => p.assessment.nodes.pop(),
    (p) => p.assessment.nodes.push(p.assessment.nodes[0]),
    (p) => (p.assessment.nodes[0].reason = ' '),
    (p) => (p.verification.contracts[0].outputs = ['invented']),
    (p) => (p.verification.outputs[0].schema.properties.count.type = 'string'),
    (p) => (p.verification = undefined),
    (p) => p.evidence.context.preparedNativeNodes.push(p.plan.nativeNodes[0]),
  ]) {
    const record = globalThis.structuredClone(result.nativePlanning);
    change(record);
    assert.throws(() =>
      validateNativeNodePlanningRecord({ ...input, plan: result, record }),
    );
  }
  const before = globalThis.structuredClone(result.nativePlanning);
  result.nativeNodes[0].parameters.nested['a.b'].push('later');
  assert.deepEqual(result.nativePlanning, before);
  const described = describeNativeNodePlanning(input);
  described.context.capabilities[0].parametersSchema.properties.count.type =
    'changed';
  assert.notEqual(
    describeNativeNodePlanning(input).context.capabilities[0].parametersSchema
      .properties.count.type,
    'changed',
  );
});

test('record construction cannot claim no additions or no model when actual original decisions require reasons', async () => {
  const { input, nodes } = nativePlanningRecordFixture();
  const plan = createNativeNodePlan({
    ...input,
    proposal: { nativeNodes: nodes, gaps: [] },
  });
  assert.throws(() => createNativeNodePlanningRecord({ ...input, plan }));
  assert.throws(() =>
    createNativeNodePlanningRecord({
      ...input,
      plan,
      assessment: { kind: 'no-additions', reason: 'wrong' },
    }),
  );
  assert.throws(() =>
    createNativeNodePlanningRecord({
      ...input,
      plan,
      assessment: {
        kind: 'additions',
        nodes: [{ nodeId: 'other', reason: 'wrong' }],
      },
    }),
  );
  assert.throws(() =>
    createNativeNodePlanningRecord({
      planId: 'zero',
      scenario: 'source',
      plan: { nativeNodes: [], gaps: [] },
      assessment: { kind: 'no-additions', reason: 'no model' },
    }),
  );
});

test('declared class-based capabilities retain prototype methods and private receiver state rather than losing them in object spread', async () => {
  const { input, nodes, explained } = nativePlanningRecordFixture();
  class DeclaredCapability {
    #schema;
    constructor(source) {
      this.name = source.name;
      this.description = source.description;
      this.parametersSchema = source.parametersSchema;
      this.waitsForAllInputs = false;
      this.exclusiveOutputPorts = false;
      this.#schema = z.toJSONSchema(source.parametersSchema);
    }
    inputPorts() {
      return ['receive'];
    }
    outputPorts() {
      return ['send'];
    }
    responseReferences() {
      return [];
    }
    outputSchema() {
      return this.#schema;
    }
  }
  input.capabilities = [new DeclaredCapability(input.capabilities[0])];
  const result = await planNativeNodes({
    ...input,
    model: nativePlanningRecordModel(explained),
    includeExplanations: true,
  });
  assert.deepEqual(result.nativeNodes, nodes);
  assert.deepEqual(result.nativePlanning.verification.contracts[0].inputs, [
    'receive',
  ]);
  assert.deepEqual(result.nativePlanning.verification.contracts[0].outputs, [
    'send',
  ]);
  assert.equal(
    result.nativePlanning.verification.outputs[0].schema.properties.count.type,
    'integer',
  );
  validateNativeNodePlanningRecord({
    ...input,
    plan: result,
    record: JSON.parse(JSON.stringify(result.nativePlanning)),
  });
});
