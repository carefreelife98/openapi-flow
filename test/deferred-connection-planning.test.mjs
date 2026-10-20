import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {
  collectDeferredApiInputSlots,
  createWorkflowConnectionPlan,
  createWorkflowDraft,
  describeWorkflowConnectionPlanning,
  inspectApiArgumentRequirements,
  validateWorkflowConnectionPlanningRecord,
  validateReviewableWorkflowGraphPlan,
} from '@openapi-flow/core';
import { planWorkflowConnections } from '@openapi-flow/langchain';
import {
  compileN8nWorkflowTemplate,
  compileReviewableN8nWorkflow,
} from '@openapi-flow/n8n';
import {
  connectionPlanningFixture,
  connectionPlanningModel,
  explainConnections,
} from './fixtures/connection-planning-record-fixture.mjs';
import { workflowTemplateFixture } from './fixtures/workflow-template-fixture.mjs';
import { requestedApiInputFixture } from './fixtures/requested-api-inputs-fixture.mjs';

function deferredDagFixture() {
  const fixture = connectionPlanningFixture();
  const material = fixture.input.materials.find(
    (item) => item.arguments.callId === 'stock',
  );
  material.arguments.bindings = [];
  material.arguments.unresolvedInputs = ['/query/id'];
  const slots = collectDeferredApiInputSlots({
    materials: fixture.input.materials.map((item) => ({
      operation: item.operation,
      ...item.arguments,
    })),
  });
  return {
    ...fixture,
    input: {
      ...fixture.input,
      deferredApiInputIds: slots.map((slot) => slot.id),
    },
    slots,
  };
}

test('five API instances and a native merge preserve the real DAG with explicit deferred input slots, not invented values', async () => {
  const { input, slots, proposal, plan } = deferredDagFixture();
  const before = globalThis.structuredClone(input.materials);
  const description = describeWorkflowConnectionPlanning(input);
  assert.deepEqual(description.context.deferredApiInputs, slots);
  assert.deepEqual(
    description.input.deferredApiInputIds,
    input.deferredApiInputIds,
  );
  assert.deepEqual(description.sources.materials, before);
  assert.equal(Object.hasOwn(slots[0], 'value'), false);
  const model = connectionPlanningModel(
    explainConnections(proposal),
    ({ context }) => {
      assert.deepEqual(context.deferredApiInputs, slots);
      assert.equal(context.nodes.length, 6);
    },
  );
  const result = await planWorkflowConnections({
    ...input,
    model,
    includeExplanations: true,
  });
  assert.equal(model.calls, 1);
  assert.deepEqual(result.edges, plan.edges);
  assert.deepEqual(result.starts, plan.starts);
  assert.deepEqual(result.blockedCalls, []);
  assert.deepEqual(result.gaps, []);
  assert.deepEqual(input.materials, before);
  validateWorkflowConnectionPlanningRecord({
    ...input,
    plan: result,
    record: result.connectionPlanning,
  });
  const tampered = globalThis.structuredClone(result.connectionPlanning);
  tampered.evidence.context.deferredApiInputs[0].schema.type = 'number';
  assert.throws(
    () =>
      validateWorkflowConnectionPlanningRecord({
        ...input,
        plan: result,
        record: tampered,
      }),
    /differs/,
  );
  const draftContext = {
    operations: input.materials.map((item) => item.operation),
    capabilities: input.capabilities,
    messages: [],
  };
  const draft = createWorkflowDraft({
    context: draftContext,
    content: {
      id: 'deferred-five-api-dag',
      requirements: [],
      apiCalls: input.materials.map((item) => ({
        id: item.arguments.callId,
        operation: item.operation.key,
        values: item.arguments.values,
        bindings: item.arguments.bindings,
        ...(item.arguments.requestMediaType === undefined
          ? {}
          : { requestMediaType: item.arguments.requestMediaType }),
      })),
      nativeNodes: result.nativeNodes,
      edges: result.edges,
    },
  });
  const compiled = compileN8nWorkflowTemplate({
    draft,
    context: draftContext,
    name: '보류한 상품 번호를 나중에 입력하는 DAG',
    deployments: [
      {
        documentId: 'source-service',
        baseUrl: 'https://fixture.example.test',
        credentialBindings: {},
      },
      {
        documentId: 'consumer-service',
        baseUrl: 'https://fixture.example.test',
        credentialBindings: {},
      },
    ],
  });
  assert.deepEqual(
    compiled.inputSlots.map((slot) => slot.id),
    slots.map((slot) => slot.id),
  );
  assert.equal(compiled.requestInputsReady, false);
  assert.equal(
    compiled.nodeMappings.filter((mapping) => mapping.kind === 'api').length,
    5,
  );
  assert.ok(
    compiled.nodeMappings.some(
      (mapping) =>
        mapping.kind === 'native' && mapping.capability === 'merge-append',
    ),
  );
  const preflight = compiled.workflow.nodes.find(
    (node) => node.id === 'openapi-flow-preflight',
  );
  assert.ok(preflight);
  assert.throws(
    () =>
      vm.runInNewContext(`(function(){${preflight.parameters.jsCode}})()`, {
        $input: {
          all: () => [{ json: { revision: draft.revision, values: {} } }],
        },
      }),
    /missing|input|입력/i,
  );
  assert.deepEqual(input.materials, before);
});

test('no permission, partial deferral, duplicate IDs, stale IDs and fabricated markers fail before the model', async () => {
  const fixture = await workflowTemplateFixture();
  const materials = fixture.draft.apiCalls.map((call) => {
    const operation = fixture.context.operations.find(
      (item) => JSON.stringify(item.key) === JSON.stringify(call.operation),
    );
    const requirements = inspectApiArgumentRequirements({
      callId: call.id,
      ...call,
      operation,
    });
    return {
      status: 'ready',
      operation,
      arguments: {
        callId: call.id,
        values: call.values,
        bindings: call.bindings,
        requestMediaType: call.requestMediaType,
        unresolvedInputs: requirements.requirements.map(
          (item) => item.targetPointer,
        ),
      },
    };
  });
  const slots = collectDeferredApiInputSlots({
    materials: materials.map((item) => ({
      operation: item.operation,
      ...item.arguments,
    })),
  });
  assert.equal(slots.length, 6);
  for (const deferredApiInputIds of [
    undefined,
    [],
    slots.slice(1).map((slot) => slot.id),
    ['stale'],
    [slots[0].id, slots[0].id],
    null,
  ]) {
    const model = connectionPlanningModel({});
    await assert.rejects(
      planWorkflowConnections({
        scenario: '입력값을 나중에 지정합니다.',
        materials,
        deferredApiInputIds,
        capabilities: fixture.context.capabilities,
        nativeNodes: fixture.draft.nativeNodes,
        model,
      }),
      /unresolved|stale|distinct|array/,
    );
    assert.equal(model.calls, 0);
  }
  const { input } = deferredDagFixture();
  const fabricated = globalThis.structuredClone(input.materials);
  fabricated
    .find((item) => item.arguments.callId === 'stock')
    .arguments.unresolvedInputs.push('/query/unknown');
  assert.throws(
    () =>
      describeWorkflowConnectionPlanning({ ...input, materials: fabricated }),
    /unresolvedInputs/,
  );
});

test('deferral never relaxes supplied OAS values, original bindings or actual DAG validation', async () => {
  const { input, proposal } = deferredDagFixture();
  for (const values of [
    { query: { id: 7 } },
    { query: { id: null } },
    { query: { unknown: 'invented' } },
  ]) {
    const materials = globalThis.structuredClone(input.materials);
    materials.find(
      (item) => item.arguments.callId === 'stock',
    ).arguments.values = values;
    const model = connectionPlanningModel({});
    await assert.rejects(
      planWorkflowConnections({ ...input, materials, model }),
      /invalid|OAS|declared|additional|schema/i,
    );
    assert.equal(model.calls, 0);
  }
  for (const edges of [
    proposal.edges.filter((edge) => edge.to !== 'summary'),
    [
      ...proposal.edges,
      { from: 'summary', output: 'main', to: 'source', input: 'main' },
    ],
    [
      ...proposal.edges,
      { from: 'invented', output: 'main', to: 'stock', input: 'main' },
    ],
    [
      ...proposal.edges,
      { from: 'stock', output: 'unknown', to: 'summary', input: 'main' },
    ],
  ])
    assert.throws(
      () =>
        createWorkflowConnectionPlan({
          ...input,
          proposal: { ...proposal, edges },
        }),
      /ancestor|root|cycle|unknown|missing node|port|source|produc|route/i,
    );
  const materials = globalThis.structuredClone(input.materials);
  materials.find(
    (item) => item.arguments.callId === 'detail',
  ).arguments.bindings[0].sourceNodeId = 'invented';
  const model = connectionPlanningModel({});
  await assert.rejects(
    planWorkflowConnections({ ...input, materials, model }),
    /unknown|source|producer/i,
  );
  assert.equal(model.calls, 0);
});

test('connection receipts keep a captured deferral decision across await and reject later reuse after the value changes', async () => {
  const { input, proposal } = deferredDagFixture();
  const originalIds = [...input.deferredApiInputIds];
  const model = connectionPlanningModel(explainConnections(proposal), () => {
    input.deferredApiInputIds[0] = 'mutated';
  });
  const result = await planWorkflowConnections({
    ...input,
    model,
    includeExplanations: true,
  });
  assert.deepEqual(
    result.connectionPlanning.evidence.context.deferredApiInputs.map(
      (slot) => slot.id,
    ),
    originalIds,
  );
  input.deferredApiInputIds = originalIds;
  const material = input.materials.find(
    (item) => item.arguments.callId === 'stock',
  );
  material.arguments.values = { query: { id: '0007' } };
  material.arguments.unresolvedInputs = [];
  assert.throws(
    () =>
      validateWorkflowConnectionPlanningRecord({
        ...input,
        plan: result,
        record: result.connectionPlanning,
      }),
    /stale/,
  );
});

test('two instances of one operation have separate slot ownership and an optional requested field remains an input, not a missing API', async () => {
  const fixture = await requestedApiInputFixture();
  const materials = ['search-original', 'search-follow-up'].map((callId) => ({
    status: 'ready',
    operation: fixture.operation,
    arguments: {
      callId,
      values: {},
      bindings: [],
      requestedInputs: ['/query/filter'],
      unresolvedInputs: ['/query/filter'],
      requestMediaType: 'application/json',
    },
  }));
  const before = globalThis.structuredClone(materials);
  const slots = collectDeferredApiInputSlots({
    materials: materials.map((item) => ({
      operation: item.operation,
      ...item.arguments,
    })),
  });
  assert.equal(slots.length, 2);
  assert.notEqual(slots[0].id, slots[1].id);
  assert.deepEqual(
    slots.map((slot) => slot.targetPointer),
    ['/query/filter', '/query/filter'],
  );
  const input = {
    scenario: '서로 다른 두 검색의 필터는 나중에 입력합니다.',
    materials,
  };
  assert.throws(
    () =>
      describeWorkflowConnectionPlanning({
        ...input,
        deferredApiInputIds: [slots[0].id],
      }),
    /unresolved OAS request inputs/,
  );
  const plan = createWorkflowConnectionPlan({
    ...input,
    deferredApiInputIds: slots.map((slot) => slot.id),
    proposal: { edges: [], additionalGaps: [], blockedCalls: [] },
  });
  assert.deepEqual(plan.starts, ['search-original', 'search-follow-up']);
  assert.deepEqual(plan.gaps, []);
  assert.deepEqual(materials, before);
  assert.deepEqual(
    materials.map((material) => material.arguments.values),
    [{}, {}],
  );
});

test('the executable fragment compiler does not inherit template deferral from extra caller properties', () => {
  const { input, proposal } = deferredDagFixture();
  const plan = createWorkflowConnectionPlan({ ...input, proposal });
  assert.throws(
    () =>
      compileReviewableN8nWorkflow({
        ...input,
        id: 'not-a-template',
        name: '실행용 컴파일은 별도 검사',
        plan,
        apiNodes: [],
      }),
    /unresolved OAS request inputs/,
  );
});

test('argument metadata cannot replace the owning original OAS during direct review validation', () => {
  const { input, plan } = deferredDagFixture();
  const material = input.materials.find(
    (item) => item.arguments.callId === 'stock',
  );
  material.arguments.values = { query: { id: 7 } };
  material.arguments.unresolvedInputs = [];
  const spoofed = globalThis.structuredClone(material.operation);
  spoofed.effective.parameters[0].schema.type = 'number';
  material.arguments.operation = spoofed;
  assert.throws(
    () =>
      validateReviewableWorkflowGraphPlan({
        materials: input.materials,
        capabilities: input.capabilities,
        plan,
      }),
    /invalid|OAS|schema/i,
  );
});
