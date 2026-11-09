import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeNativeNodePlanning,
  describeNativeInstanceDependencies,
  resolveNativeInstanceSelection,
} from '@openapi-flow/core';
import {
  resolveN8nNativePlanningFeatures,
  N8nNativeFeature,
  describeN8nManualTrigger,
} from '@openapi-flow/n8n';
const features = [
  N8nNativeFeature.If,
  N8nNativeFeature.RejoinExclusiveBranches,
  N8nNativeFeature.EmitLiteralData,
  N8nNativeFeature.ComposeNativeOutputs,
];
function fixture() {
  return {
    planId: 'output-protocol-contract',
    scenario: 'Use configured values after a conditional check.',
    entrypoint: describeN8nManualTrigger(),
    capabilities: resolveN8nNativePlanningFeatures({ features })
      .planningCapabilities,
    apiMaterials: [],
    allowRuntimeParameters: true,
    includeExplanations: false,
  };
}
test('planning material distinguishes potential JSON producers from exclusive control and untyped rejoin contracts', () => {
  const input = fixture(),
    context = describeNativeNodePlanning(input).context;
  const protocols = Object.fromEntries(
    context.capabilities.map((capability) => [
      capability.name,
      capability.potentialOutputReferenceSources,
    ]),
  );
  assert.deepEqual(protocols, {
    if: ['exclusive-output'],
    'rejoin-exclusive-branches': [],
    'emit-literal-data': ['node-output'],
    'compose-native-outputs': ['node-output'],
  });
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: input.capabilities.map((c) => ({
        capability: c.name,
        purpose: c.name,
        parameterSource: 'literal',
      })),
      gaps: [],
    },
  });
  const dependencies = describeNativeInstanceDependencies({
      ...input,
      selection,
    }),
    target = selection.instances.find(
      (n) => n.capability === 'compose-native-outputs',
    );
  const eligible = selection.instances.filter((n) =>
    dependencies.sourceCandidatesByNodeId[target.id].includes(n.id),
  );
  assert.deepEqual(
    eligible.map((n) => n.capability),
    ['emit-literal-data'],
  );
  assert.ok(
    eligible.every((node) =>
      protocols[node.capability].includes('node-output'),
    ),
  );
});
test('output protocols follow registered behavior rather than feature names and do not fabricate a future schema', () => {
  const input = fixture(),
    renamed = input.capabilities.map((capability, index) => ({
      ...capability,
      name: 'arbitrary-role-' + index,
    }));
  const context = describeNativeNodePlanning({
    ...input,
    capabilities: renamed,
  }).context;
  assert.deepEqual(
    context.capabilities.map((c) => c.potentialOutputReferenceSources),
    [['exclusive-output'], [], ['node-output'], ['node-output']],
  );
  assert.ok(context.capabilities.every((c) => !('outputSchema' in c)));
  const changed = renamed.map((c) => ({ ...c, outputSchema: undefined }));
  assert.deepEqual(
    describeNativeNodePlanning({
      ...input,
      capabilities: changed,
    }).context.capabilities.map((c) => c.potentialOutputReferenceSources),
    [['exclusive-output'], [], [], []],
  );
});

test('malformed output implementations fail at the capability boundary rather than becoming control-only metadata', () => {
  const input = fixture();
  assert.throws(
    () =>
      describeNativeNodePlanning({
        ...input,
        capabilities: [
          { ...input.capabilities[2], outputSchema: 'not-an-implementation' },
        ],
      }),
    /outputSchema must be a function/,
  );
});

test('selection and value generation receive the same output protocols without repeated role metadata or extra model calls', async () => {
  const { selectNativeNodeInstances, generateNativeNodeParameters } =
    await import('@openapi-flow/langchain');
  const input = {
    ...fixture(),
    scenario:
      'Emit the explicitly requested literal true result and keep the other selected roles unchanged.',
  };
  const proposal = {
    instances: [
      ...input.capabilities.map((c) => ({
        capability: c.name,
        purpose: c.name,
        parameterSource: 'literal',
      })),
      {
        capability: 'emit-literal-data',
        purpose: 'second literal result',
        parameterSource: 'literal',
      },
    ],
    gaps: [],
  };
  const selectionCalls = [],
    valueCalls = [];
  const model = (output, calls) => ({
    withStructuredOutput() {
      return {
        async invoke(messages) {
          calls.push(JSON.parse(messages[1].content));
          return globalThis.structuredClone(output);
        },
      };
    },
  });
  const selection = await selectNativeNodeInstances({
    ...input,
    model: model(proposal, selectionCalls),
  });
  const nodeId = selection.instances.find(
    (n) => n.capability === 'emit-literal-data',
  ).id;
  const result = await generateNativeNodeParameters({
    ...input,
    selection,
    nodeId,
    configuredNodes: [],
    model: model(
      {
        decision: {
          status: 'provided',
          parameters: { fields: [{ name: 'result', value: true }] },
        },
      },
      valueCalls,
    ),
  });
  assert.equal(result.status, 'ready');
  assert.equal(selectionCalls.length, 1);
  assert.equal(valueCalls.length, 1);
  const expected = input.capabilities.map((c) => ({
    name: c.name,
    potentialOutputReferenceSources:
      typeof c.outputSchema === 'function'
        ? ['node-output']
        : c.exclusiveOutputPorts
          ? ['exclusive-output']
          : [],
  }));
  assert.deepEqual(
    selectionCalls[0].capabilities.map(
      ({ name, potentialOutputReferenceSources }) => ({
        name,
        potentialOutputReferenceSources,
      }),
    ),
    expected,
  );
  assert.deepEqual(valueCalls[0].selectedCapabilities, expected);
  assert.equal(valueCalls[0].selectedRoles.length, 5);
  assert.equal(valueCalls[0].selectedCapabilities.length, 4);
  assert.deepEqual(result.node.parameters, {
    fields: [{ name: 'result', value: true }],
  });
});
