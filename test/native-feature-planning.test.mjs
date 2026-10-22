import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  resolveNativeMaterialSnapshot,
  createWorkflowDraft,
  describeWorkflowDraftNativeNodeAdditionReadiness,
  describeWorkflowDraftNativeNodeAddition,
  resolveWorkflowDraftNativeNodeAddition,
} from '@openapi-flow/core';
import {
  N8nNativeFeature,
  resolveN8nNativeFeatures,
  resolveN8nNativePlanningFeatures,
} from '@openapi-flow/n8n';
import {
  nativeFeatureRegistryFixture,
  nativeFeatureParameters,
} from './fixtures/native-feature-registry-fixture.mjs';
import { connectionEditPlan } from './fixtures/workflow-draft-connection-edit-fixture.mjs';

test('planning inventory preserves pending context and exposes stable definitions without fabricated ready outputs', () => {
  const registry = resolveN8nNativePlanningFeatures();
  assert.equal(registry.registrations.length, 12);
  assert.equal(registry.capabilities.length, 6);
  assert.equal(registry.planningCapabilities.length, 11);
  assert.equal(
    registry.registrations.filter(
      (entry) => entry.status === 'requires-context',
    ).length,
    6,
  );
  for (const definition of registry.planningCapabilities.filter(
    (entry) => entry.bindMaterialContracts,
  )) {
    assert.equal(Object.hasOwn(definition, 'materialSources'), false);
    assert.ok(definition.materialRequirements.length);
    for (const method of ['responseReferences', 'outputSchema', 'compile'])
      assert.throws(
        () => definition[method]({}),
        /requires actual material contract binding/,
      );
  }
  assert.deepEqual(resolveN8nNativePlanningFeatures({ features: [] }), {
    registrations: [],
    capabilities: [],
    planningCapabilities: [],
    planningRegistrations: [],
  });
  assert.throws(
    () => resolveN8nNativePlanningFeatures({ features: ['unknown'] }),
    /invalid/,
  );
  assert.throws(
    () => resolveN8nNativePlanningFeatures({ features: ['if', 'if'] }),
    /invalid/,
  );
  assert.throws(
    () =>
      resolveN8nNativeFeatures({
        features: [N8nNativeFeature.SplitApiResponseArray],
      }),
    /requires apiMaterials/,
  );
});

test('all five late-bound definitions resolve original contracts and official SDK fragments without fake runtime names', async () => {
  const fixture = await nativeFeatureRegistryFixture();
  const features = [
    N8nNativeFeature.SplitApiResponseArray,
    N8nNativeFeature.CollectApiResponses,
    N8nNativeFeature.ComposeApiResponses,
    N8nNativeFeature.SplitNativeOutputArray,
    N8nNativeFeature.JoinApiItems,
  ];
  const registry = resolveN8nNativePlanningFeatures({
    features,
    itemMode: 'linked',
  });
  const before = registry.planningCapabilities.map((capability) =>
    z.toJSONSchema(capability.parametersSchema),
  );
  for (const capability of registry.planningCapabilities) {
    const parameters = nativeFeatureParameters[capability.name];
    const node = {
      id: `consumer-${capability.name}`,
      capability: capability.name,
      parameters,
    };
    const snapshot = resolveNativeMaterialSnapshot({
      apiMaterials: fixture.apiMaterials,
      nativeOutputs: fixture.nativeOutputSources.map(({ nodeId, schema }) => ({
        nodeId,
        schema,
      })),
      nativeNodes: [node],
      capabilities: [capability],
      deferredNodeIds: [],
    });
    assert.equal(snapshot.status, 'ready');
    const bound = snapshot.capabilities[0];
    const ready = resolveN8nNativeFeatures({
      ...fixture,
      features: [capability.name],
    }).capabilities[0];
    assert.deepEqual(
      bound.outputSchema(parameters),
      ready.outputSchema(parameters),
    );
    const fragment = bound.compile({
      planned: node,
      position: [0, 0],
      apiNodeNames: { left: 'Request left', right: 'Request right' },
      nativeOutputSources: fixture.nativeOutputSources,
    });
    assert.equal(fragment.nodeId, node.id);
    assert.ok(fragment.nodes.length);
    assert.ok(
      fragment.nodes.every((entry) => entry.type.startsWith('n8n-nodes-base.')),
    );
    assert.deepEqual(
      z.toJSONSchema(capability.parametersSchema),
      before[registry.planningCapabilities.indexOf(capability)],
    );
    assert.equal(Object.hasOwn(capability, 'materialSources'), false);
  }
});

test('missing sources stay pending and an altered definition cannot silently acquire the registered binder', () => {
  const [capability] = resolveN8nNativePlanningFeatures({
    features: [N8nNativeFeature.SplitNativeOutputArray],
  }).planningCapabilities;
  const snapshot = resolveNativeMaterialSnapshot({
    apiMaterials: [],
    nativeOutputs: [],
    nativeNodes: [
      {
        id: 'split',
        capability: capability.name,
        parameters: { sourceNodeId: 'unknown', pointer: '/rows' },
      },
    ],
    capabilities: [capability],
    deferredNodeIds: [],
  });
  assert.equal(snapshot.status, 'pending');
  assert.equal(Object.hasOwn(snapshot, 'capabilities'), false);
  assert.deepEqual(snapshot.pending[0].sourceNodeIds, ['unknown']);
  const altered = {
    ...capability,
    compile() {
      throw new Error('Unapproved replacement');
    },
  };
  assert.throws(
    () =>
      altered.bindMaterialContracts({ apiMaterials: [], nativeOutputs: [] }),
    /changed compile without a coherent/,
  );
});

test('returned prerequisite metadata cannot mutate another registry or silently change its own material binder', () => {
  const input = { features: [N8nNativeFeature.SplitNativeOutputArray] };
  const first = resolveN8nNativePlanningFeatures(input).planningCapabilities[0];
  first.materialRequirements[0].minimumItems = 9;
  const fresh = resolveN8nNativePlanningFeatures(input).planningCapabilities[0];
  assert.deepEqual(fresh.materialRequirements, [
    { field: 'nativeOutputs', minimumItems: 1 },
  ]);
  assert.throws(
    () => first.bindMaterialContracts({ apiMaterials: [], nativeOutputs: [] }),
    /changed materialRequirements without a coherent/,
  );
});

test('readiness derives declared counts, includes them in the context fingerprint and never invents a source', async () => {
  const fixture = await nativeFeatureRegistryFixture();
  const capabilities = resolveN8nNativePlanningFeatures({
    features: [
      N8nNativeFeature.JsonOutput,
      N8nNativeFeature.SplitNativeOutputArray,
    ],
    jsonOutput: fixture.jsonOutput,
  }).planningCapabilities;
  const context = {
    operations: [],
    capabilities,
    messages: [
      {
        id: 'edit-1',
        text: 'Create explicit rows and split their unchanged items.',
      },
    ],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'readiness',
      requirements: [],
      apiCalls: [],
      nativeNodes: [],
      edges: [],
    },
  });
  const base = { draft, context, requestMessageIds: ['edit-1'] };
  const plan = connectionEditPlan(base, [
    {
      kind: 'add-native-node',
      capability: N8nNativeFeature.SplitNativeOutputArray,
    },
    { kind: 'add-native-node', capability: 'original-context' },
  ]);
  const input = {
    ...base,
    plan,
    resolutions: [],
    repairs: [],
    stepId: plan.steps[0].id,
  };
  const original = globalThis.structuredClone(draft);
  const waiting = describeWorkflowDraftNativeNodeAdditionReadiness(input);
  assert.equal(waiting.status, 'requires-context');
  assert.deepEqual(waiting.missingContext, [
    { field: 'nativeOutputs', minimumItems: 1, availableItems: 0 },
  ]);
  assert.throws(
    () => describeWorkflowDraftNativeNodeAddition(input),
    /requires nativeOutputs/,
  );
  const producer = { ...input, stepId: plan.steps[1].id };
  const result = resolveWorkflowDraftNativeNodeAddition({
    ...producer,
    fingerprint: describeWorkflowDraftNativeNodeAddition(producer).fingerprint,
    proposal: {
      decision: {
        status: 'provided',
        parameters: { rows: [3, 1], marker: '={{ literal text }}' },
        sourceMessageIds: ['edit-1'],
      },
    },
  });
  const next = { ...input, resolutions: [result.resolution] };
  assert.equal(
    describeWorkflowDraftNativeNodeAdditionReadiness(next).status,
    'ready',
  );
  const description = describeWorkflowDraftNativeNodeAddition(next);
  assert.deepEqual(description.parametersSchema.properties.sourceNodeId.enum, [
    plan.steps[1].newNodeId,
  ]);
  assert.equal(description.sources.values[0].nodeId, plan.steps[1].newNodeId);
  assert.deepEqual(draft, original);
  const definition = capabilities.find(
    (entry) => entry.name === N8nNativeFeature.SplitNativeOutputArray,
  );
  definition.materialRequirements = [
    { field: 'nativeOutputs', minimumItems: 2 },
  ];
  assert.throws(
    () => describeWorkflowDraftNativeNodeAdditionReadiness(next),
    /contextFingerprint|context.*changed|stale|context fingerprint/,
  );
});
