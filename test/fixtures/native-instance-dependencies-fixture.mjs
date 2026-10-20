import { z } from 'zod';
import {
  resolveNativeInstanceSelection,
  resolveNativeInstanceDependencies,
  describeNativeNodeConfiguration,
  resolveNativeNodeParameters,
} from '@openapi-flow/core';
import {
  createJsonOutputCapability,
  resolveN8nNativePlanningFeatures,
  N8nNativeFeature,
} from '@openapi-flow/n8n';

export const nativeDependencyValues = {
  groups: [{ children: [0, false, '={{ literal child }}'] }, { children: [3] }],
};
export const nativeDependencyParametersSchema = z.strictObject({
  groups: z.array(
    z.strictObject({
      children: z.array(z.union([z.number(), z.boolean(), z.string()])),
    }),
  ),
});

export function nativeDependencyCapabilities() {
  return [
    ...resolveN8nNativePlanningFeatures({
      features: [N8nNativeFeature.SplitNativeOutputArray],
      itemMode: 'linked',
    }).planningCapabilities,
    createJsonOutputCapability({
      name: 'original-groups',
      description:
        'Create original groups and children without changing any values or types.',
      parametersSchema: nativeDependencyParametersSchema,
    }),
  ];
}

export function nativeDependencyChoices() {
  return [
    {
      capability: N8nNativeFeature.SplitNativeOutputArray,
      purpose: 'final children',
      parameterSource: 'literal',
    },
    {
      capability: N8nNativeFeature.SplitNativeOutputArray,
      purpose: 'parent groups',
      parameterSource: 'literal',
    },
    {
      capability: 'original-groups',
      purpose: 'original groups',
      parameterSource: 'literal',
    },
  ];
}

export function nativeDependencyFixture(options = {}) {
  const input = {
    planId: 'explicit-producers',
    scenario:
      'Create the original groups, split groups into parent items, then split each parent item children without changing values or types.',
    capabilities: nativeDependencyCapabilities(),
    preparedNativeNodes: options.withPrepared
      ? [
          {
            id: 'unrelated-existing',
            capability: 'original-groups',
            parameters: { groups: [] },
          },
        ]
      : [],
    ...(options.explanations ? { includeExplanations: true } : {}),
  };
  const selection = resolveNativeInstanceSelection({
    ...input,
    proposal: {
      instances: nativeDependencyChoices().map((choice) => ({
        ...choice,
        ...(options.explanations
          ? { reason: 'Use this explicitly requested role.' }
          : {}),
      })),
      gaps: [],
      ...(options.explanations
        ? { reason: 'Use only the requested nested split roles.' }
        : {}),
    },
  });
  const [child, parent, source] = selection.instances;
  const proposal = {
    sourcesByNodeId: Object.fromEntries(
      [
        [child.id, { sourceNodeIds: [parent.id] }],
        [parent.id, { sourceNodeIds: [source.id] }],
        [source.id, { sourceNodeIds: [] }],
      ].map(([id, choice]) => [
        id,
        {
          ...choice,
          ...(options.explanations && choice.sourceNodeIds.length
            ? {
                reason:
                  'Use exactly the scenario role producer, not an unrelated output.',
              }
            : {}),
        },
      ]),
    ),
  };
  const dependencies = resolveNativeInstanceDependencies({
    ...input,
    selection,
    proposal,
  });
  return { input, selection, child, parent, source, proposal, dependencies };
}

export function nativeDependencyConfiguration(f, node, configuredNodes = []) {
  return {
    ...f.input,
    selection: f.selection,
    dependencies: f.dependencies,
    nodeId: node.id,
    configuredNodes,
  };
}

export function configureNativeDependency(
  f,
  node,
  parameters,
  configuredNodes = [],
) {
  const input = nativeDependencyConfiguration(f, node, configuredNodes);
  const result = resolveNativeNodeParameters({
    ...input,
    fingerprint: describeNativeNodeConfiguration(input).fingerprint,
    proposal: {
      decision: {
        status: 'provided',
        parameters,
        ...(f.input.includeExplanations
          ? {
              reason:
                'Use the original typed setting and explicitly selected producer.',
            }
          : {}),
      },
    },
  });
  if (result.status !== 'ready')
    throw new Error('Expected a configured fixture node');
  return result.node;
}
