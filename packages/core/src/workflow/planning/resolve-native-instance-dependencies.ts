import { createHash } from 'node:crypto';
import type { NativeSelectedPlanningInput } from '../../types/native-node-planning.js';
import type {
  NativeInstanceDependencyContext,
  NativeInstanceDependencyPlan,
  ResolveNativeInstanceDependenciesInput,
  ValidateNativeInstanceDependenciesInput,
} from '../../types/native-instance-dependencies.js';
import { validateNativeInstanceSelection } from './resolve-native-instance-selection.js';
import { describeNativeNodePlanning } from './describe-native-node-planning.js';
import { resolveNativePlanningMaterials } from './resolve-native-planning-materials.js';
import { createNativeInstanceDependenciesSchema } from '../../schemas/native-instance-dependencies-schema.js';
import { jsonValuesEqual } from '../../utils/json-values-equal.js';
import { validateNativeProducerDependencyGraph } from './validate-native-producer-dependency-graph.js';
import {
  describePendingNativeProducer,
  selectNativeParameterProducers,
} from './select-native-parameter-producers.js';
import type { NativeParameterProducerCandidate } from '../../types/native-producer-eligibility.js';

/** Future role IDs are candidates, not evidence of ready output contracts. */
export function describeNativeInstanceDependencies(
  input: NativeSelectedPlanningInput,
): NativeInstanceDependencyContext {
  const selection = validateNativeInstanceSelection(input);
  const { input: snapshot } = describeNativeNodePlanning(input);
  const prepared = resolveNativePlanningMaterials({
    nativeNodes: snapshot.preparedNativeNodes,
    capabilities: snapshot.capabilities,
    apiMaterials: snapshot.apiMaterials,
    nativeOutputs: [],
  });
  const producers: NativeParameterProducerCandidate[] = [
    ...snapshot.apiMaterials.map(
      (source) =>
        ({
          nodeId: source.callId,
          referenceSources: ['response'] as const,
        }) satisfies NativeParameterProducerCandidate,
    ),
    ...snapshot.preparedNativeNodes.map((node) => {
      const capability = snapshot.capabilities.find(
        (entry) => entry.name === node.capability,
      )!;
      const producer = describePendingNativeProducer(node.id, capability);
      return {
        ...producer,
        referenceSources: producer.referenceSources.filter(
          (source) =>
            source !== 'node-output' ||
            prepared.outputs.some((output) => output.nodeId === node.id),
        ),
      };
    }),
    ...selection.instances.map((node) =>
      describePendingNativeProducer(
        node.id,
        snapshot.capabilities.find((entry) => entry.name === node.capability)!,
      ),
    ),
  ];
  return structuredClone({
    selectionId: selection.id,
    scenario: selection.context.scenario,
    instances: selection.instances,
    capabilities: selection.context.capabilities,
    apiMaterials: selection.context.apiMaterials,
    preparedNativeNodes: selection.context.preparedNativeNodes,
    preparedOutputs: prepared.outputs,
    sourceCandidatesByNodeId: Object.fromEntries(
      selection.instances.map((node) => [
        node.id,
        selectNativeParameterProducers({
          nodeId: node.id,
          capability: snapshot.capabilities.find(
            (entry) => entry.name === node.capability,
          )!,
          producers,
        }),
      ]),
    ),
  });
}

/** Validate producer choice and its planning DAG, without generating parameters, outputs or execution edges. */
export function resolveNativeInstanceDependencies(
  input: ResolveNativeInstanceDependenciesInput,
): NativeInstanceDependencyPlan {
  const context = describeNativeInstanceDependencies(input);
  const proposal = createNativeInstanceDependenciesSchema(input).parse(
    input.proposal,
  );
  if (!jsonValuesEqual(proposal, input.proposal))
    throw new Error(
      'Native dependency choices cannot be coerced, defaulted or transformed',
    );
  validateNativeProducerDependencyGraph(
    context.instances.map((node) => node.id),
    proposal,
  );
  const fields = { selectionId: context.selectionId, context, proposal };
  return {
    id:
      'native-dependencies:' +
      createHash('sha256').update(JSON.stringify(fields)).digest('hex'),
    ...structuredClone(fields),
  };
}

export function validateNativeInstanceDependencies(
  input: ValidateNativeInstanceDependenciesInput,
): NativeInstanceDependencyPlan {
  if (!input.dependencies?.proposal)
    throw new Error('Native dependencies require their original proposal');
  const expected = resolveNativeInstanceDependencies({
    ...input,
    proposal: input.dependencies.proposal,
  });
  if (!jsonValuesEqual(expected, input.dependencies))
    throw new Error(
      'Native dependency plan is stale or its original choices/material context changed',
    );
  return expected;
}
