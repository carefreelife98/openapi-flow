import assert from 'node:assert/strict';
import test from 'node:test';
import { planNativeNodes } from '@openapi-flow/langchain';
import { createWorkflowPlanningCapabilities } from '@openapi-flow/core';
import {
  N8nNativeFeature,
  resolveN8nNativeFeatures,
  createN8nNativeCapabilities,
  createPassThroughCapability,
  compileReviewableN8nWorkflow,
} from '@openapi-flow/n8n';
import {
  nativeFeatureRegistryFixture,
  nativeFeatureParameters,
} from './fixtures/native-feature-registry-fixture.mjs';

test('omission inventories every registered feature and exposes unmet context instead of fabricated contracts', () => {
  assert.equal(Object.isFrozen(N8nNativeFeature), true);
  const registry = resolveN8nNativeFeatures();
  assert.deepEqual(
    registry.registrations.map((entry) => entry.feature),
    Object.values(N8nNativeFeature),
  );
  assert.equal(registry.registrations.length, 13);
  assert.equal(registry.capabilities.length, 6);
  const pending = registry.registrations.filter(
    (entry) => entry.status === 'requires-context',
  );
  assert.equal(pending.length, 7);
  assert.ok(pending.every((entry) => entry.missingContext.length > 0));
  assert.deepEqual(
    pending.find((entry) => entry.feature === N8nNativeFeature.JoinApiItems)
      .missingContext,
    [
      { field: 'apiMaterials', minimumItems: 2 },
      { field: 'nativeOutputSources', minimumItems: 1 },
    ],
  );
  pending[0].missingContext[0].field = 'client-mutated-field';
  assert.deepEqual(
    resolveN8nNativeFeatures().registrations.find(
      (entry) => entry.feature === N8nNativeFeature.JsonOutput,
    ).missingContext,
    [{ field: 'jsonOutput' }],
  );
  assert.ok(pending.every((entry) => !Object.hasOwn(entry, 'capability')));
  assert.ok(
    registry.capabilities.every((capability) =>
      registry.registrations.some(
        (entry) => entry.status === 'ready' && entry.capability === capability,
      ),
    ),
  );
  assert.deepEqual(resolveN8nNativeFeatures({ features: [] }), {
    registrations: [],
    capabilities: [],
  });
});

test('explicit feature allowlist preserves order and fails if its source contracts are absent', () => {
  const selected = [N8nNativeFeature.PassThrough, N8nNativeFeature.If];
  const result = resolveN8nNativeFeatures({ features: selected });
  assert.deepEqual(
    result.capabilities.map((entry) => entry.name),
    selected,
  );
  for (const feature of [
    N8nNativeFeature.JsonOutput,
    N8nNativeFeature.SplitApiResponseArray,
    N8nNativeFeature.CollectApiResponses,
    N8nNativeFeature.ComposeApiResponses,
    N8nNativeFeature.GatherApiResponses,
    N8nNativeFeature.SplitNativeOutputArray,
    N8nNativeFeature.JoinApiItems,
  ]) {
    assert.throws(
      () => resolveN8nNativeFeatures({ features: [feature] }),
      (error) =>
        error.message.includes(feature) &&
        /requires (jsonOutput|apiMaterials|nativeOutputSources)/.test(
          error.message,
        ),
    );
  }
  assert.throws(
    () => resolveN8nNativeFeatures({ features: ['not-registered'] }),
    /features is invalid/,
  );
  assert.throws(
    () => resolveN8nNativeFeatures({ features: [...selected, selected[0]] }),
    /features is invalid/,
  );
  assert.throws(() => resolveN8nNativeFeatures({ features: null }), /invalid/);
});

test('every registered factory retains original contracts, ports and official SDK compilation', async () => {
  const context = await nativeFeatureRegistryFixture();
  const original = globalThis.structuredClone(context.apiMaterials);
  const registry = resolveN8nNativeFeatures(context);
  assert.equal(
    registry.capabilities.length,
    Object.keys(N8nNativeFeature).length,
  );
  const apiNodeNames = { left: 'Request left', right: 'Request right' };
  const apiResponseContracts = Object.fromEntries(
    context.apiMaterials.map((item) => [item.callId, item.operation]),
  );
  for (const entry of registry.registrations) {
    assert.equal(entry.status, 'ready');
    const parameters = nativeFeatureParameters[entry.feature];
    assert.ok(parameters, `Missing regression for ${entry.feature}`);
    assert.equal(
      entry.capability.parametersSchema.safeParse(parameters).success,
      true,
    );
    const id = `instance-${entry.feature}`;
    const fragment = entry.capability.compile({
      planned: { id, capability: entry.capability.name, parameters },
      position: [300, 0],
      apiNodeNames,
      apiResponseContracts,
    });
    assert.equal(fragment.nodeId, id);
    assert.deepEqual(
      Object.keys(fragment.inputPorts),
      entry.capability.inputPorts(parameters),
    );
    assert.deepEqual(
      Object.keys(fragment.outputPorts),
      entry.capability.outputPorts(parameters),
    );
    assert.ok(fragment.nodes.length > 0);
    assert.ok(
      fragment.nodes.every((node) => node.type.startsWith('n8n-nodes-base.')),
    );
  }
  const literal = registry.registrations.find(
    (entry) => entry.feature === N8nNativeFeature.JsonOutput,
  ).capability;
  assert.equal(literal.parametersSchema, context.jsonOutput.parametersSchema);
  assert.deepEqual(context.apiMaterials, original);
  assert.deepEqual(
    resolveN8nNativeFeatures({
      ...context,
      features: Object.values(N8nNativeFeature),
    }).capabilities.map((capability) => capability.name),
    registry.capabilities.map((capability) => capability.name),
  );
});

test('API/native source enums and item-join prerequisites use supplied instance identities', async () => {
  const context = await nativeFeatureRegistryFixture();
  const registry = resolveN8nNativeFeatures(context);
  const byFeature = new Map(
    registry.registrations.map((entry) => [entry.feature, entry.capability]),
  );
  for (const feature of [
    N8nNativeFeature.SplitApiResponseArray,
    N8nNativeFeature.CollectApiResponses,
  ]) {
    assert.equal(
      byFeature
        .get(feature)
        .parametersSchema.safeParse({ sourceNodeId: 'invented', pointer: '' })
        .success,
      false,
    );
  }
  assert.equal(
    byFeature
      .get(N8nNativeFeature.SplitNativeOutputArray)
      .parametersSchema.safeParse({ sourceNodeId: 'invented', pointer: '' })
      .success,
    false,
  );
  assert.throws(
    () =>
      resolveN8nNativeFeatures({
        ...context,
        apiMaterials: context.apiMaterials.slice(0, 1),
        features: [N8nNativeFeature.JoinApiItems],
      }),
    /apiMaterials \(at least 2\)/,
  );
  const planning = createWorkflowPlanningCapabilities({
    capabilities: registry.capabilities,
    apiCallIds: ['left', 'right'],
  });
  const condition = planning.find(
    (entry) => entry.name === N8nNativeFeature.If,
  );
  const response = { source: 'response', nodeId: 'invented', pointer: '/id' };
  assert.equal(
    condition.parametersSchema.safeParse({
      combinator: 'and',
      conditions: [
        {
          left: response,
          operator: 'equals',
          right: { source: 'literal', value: 'x' },
        },
      ],
    }).success,
    false,
  );
});

test('invalid supplied context fails even when a different feature was requested', async () => {
  const context = await nativeFeatureRegistryFixture();
  for (const [patch, error] of [
    [{ itemMode: 'guess' }, /itemMode/],
    [{ apiMaterials: null }, /apiMaterials/],
    [
      { apiMaterials: [...context.apiMaterials, context.apiMaterials[0]] },
      /unique callIds/,
    ],
    [
      {
        nativeOutputSources: [
          { ...context.nativeOutputSources[0], nodeName: '' },
        ],
      },
      /nodeName/,
    ],
    [{ nativeOutputSources: [{ nodeId: 'x', nodeName: 'x' }] }, /schema/],
    [
      { jsonOutput: { ...context.jsonOutput, parametersSchema: {} } },
      /Zod parametersSchema/,
    ],
    [{ extensions: {} }, /extensions/],
  ])
    assert.throws(
      () =>
        resolveN8nNativeFeatures({
          ...context,
          ...patch,
          features: [N8nNativeFeature.PassThrough],
        }),
      error,
    );
});

test('host extensions retain implementation identity and cannot override a ready registered name', () => {
  const extension = { ...createPassThroughCapability(), name: 'host-relay' };
  const registry = resolveN8nNativeFeatures({
    features: [],
    extensions: [extension],
  });
  assert.equal(registry.capabilities[0], extension);
  assert.deepEqual(registry.registrations, []);
  assert.throws(
    () =>
      resolveN8nNativeFeatures({ extensions: [createPassThroughCapability()] }),
    /duplicate capability pass-through/,
  );
  assert.throws(
    () =>
      resolveN8nNativeFeatures({
        features: [],
        extensions: [{ ...extension, compile: undefined }],
      }),
    /complete named capability/,
  );
  assert.throws(
    () =>
      resolveN8nNativeFeatures({
        features: [],
        extensions: [extension, extension],
      }),
    /duplicate capability host-relay/,
  );
});

test('published four-feature factory delegates without expanding its selection or changing its order', () => {
  assert.throws(
    () => createN8nNativeCapabilities(null),
    /input must be an object/,
  );
  assert.throws(
    () => resolveN8nNativeFeatures(null),
    /input must be an object/,
  );
  assert.deepEqual(
    createN8nNativeCapabilities().map((capability) => capability.name),
    [
      N8nNativeFeature.If,
      N8nNativeFeature.MergeAppend,
      N8nNativeFeature.AssertResponses,
      N8nNativeFeature.StopAndError,
    ],
  );
});

test('enum-selected native-only model plan compiles through existing core and SDK boundaries', async () => {
  const registry = resolveN8nNativeFeatures({
    features: [N8nNativeFeature.PassThrough],
  });
  let calls = 0;
  const planned = {
    id: 'relay-1',
    capability: N8nNativeFeature.PassThrough,
    parameters: {},
  };
  const model = {
    withStructuredOutput(schema) {
      const wire = schema;
      assert.equal(
        wire.properties.nativeNodes.items.anyOf[0].properties.capability.const,
        N8nNativeFeature.PassThrough,
      );
      return {
        async invoke(messages) {
          calls++;
          assert.deepEqual(
            JSON.parse(messages[1].content).capabilities.map(
              (capability) => capability.name,
            ),
            [N8nNativeFeature.PassThrough],
          );
          return { nativeNodes: [planned], gaps: [] };
        },
      };
    },
  };
  const nativePlan = await planNativeNodes({
    planId: 'registry-only',
    scenario: 'Forward input unchanged.',
    model,
    capabilities: registry.capabilities,
  });
  assert.equal(calls, 1);
  const result = compileReviewableN8nWorkflow({
    id: 'registry-native-only',
    name: 'Enum-selected native-only workflow',
    plan: {
      nativeNodes: nativePlan.nativeNodes,
      edges: [],
      starts: ['relay-1'],
      gaps: [],
      blockedCalls: [],
    },
    materials: [],
    apiNodes: [],
    capabilities: registry.capabilities,
  });
  assert.equal(result.status, 'complete');
  assert.ok(
    result.workflow.nodes.some(
      (node) => node.id === planned.id && node.type === 'n8n-nodes-base.noOp',
    ),
  );
});
