import {
  describeWorkflowConnectionGoals,
  resolveNativeMaterialSnapshot,
} from '@openapi-flow/core';
import {
  nativeDependencyFixture,
  configureNativeDependency,
  nativeDependencyValues,
} from './native-instance-dependencies-fixture.mjs';

export function connectionNativeRepairFixture(stage = 'native-dependencies') {
  const f = nativeDependencyFixture({ withPrepared: true });
  const original = configureNativeDependency(
    f,
    f.source,
    nativeDependencyValues,
  );
  const parent = configureNativeDependency(
    f,
    f.parent,
    { sourceNodeId: original.id, pointer: '/groups' },
    [original],
  );
  const child = configureNativeDependency(
    f,
    f.child,
    { sourceNodeId: parent.id, pointer: '/item/children' },
    [original, parent],
  );
  const broken = globalThis.structuredClone(parent);
  broken.parameters.sourceNodeId = 'unrelated-existing';
  const source = {
    scenario: f.input.scenario,
    capabilities: f.input.capabilities,
    materials: [],
    nativeNodes: [...f.input.preparedNativeNodes, original, broken, child],
    edges: [],
    requirements: [
      {
        id: 'intent',
        text: f.input.scenario,
        sources: [
          { kind: 'message', messageId: 'request', quote: f.input.scenario },
        ],
      },
    ],
  };
  const bound = resolveNativeMaterialSnapshot({
    apiMaterials: [],
    nativeOutputs: [],
    nativeNodes: source.nativeNodes,
    capabilities: source.capabilities,
    deferredNodeIds: [],
  });
  if (bound.status !== 'ready')
    throw new Error('Native repair fixture requires ready original materials');
  source.capabilities = bound.capabilities;
  const request = {
    kind: 'replan-materials',
    sourceFingerprint:
      describeWorkflowConnectionGoals(source).sourceFingerprint,
    request: {
      kind: 'replan-materials',
      targets: [{ stage, nodeId: parent.id }],
      factIds: ['intent'],
      reason:
        'The parent must read the requested original groups, not the unrelated prepared source.',
    },
  };
  const { dependencies: initialDependencies, ...fields } = f;
  return {
    ...fields,
    initialDependencies,
    original,
    parent,
    child,
    broken,
    source,
    request,
  };
}
