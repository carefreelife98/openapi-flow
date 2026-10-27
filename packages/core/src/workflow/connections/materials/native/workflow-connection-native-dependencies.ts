import { isDeepStrictEqual } from 'node:util';
import type { z } from 'zod';
import type {
  WorkflowConnectionNativeRepairInput,
  WorkflowConnectionNativeDependencyDescription,
  WorkflowConnectionNativeDependencies,
  ResolveWorkflowConnectionNativeDependenciesInput,
} from '../../../../types/workflow-connection-native-repair.js';
import type { NativeInstanceDependencyProposal } from '../../../../types/native-instance-dependencies.js';
import type { NativeParameterProducerCandidate } from '../../../../types/native-producer-eligibility.js';
import { prepareConnectionNativeRepair } from './prepare-connection-native-repair.js';
import { nativeParameterProducerIds } from '../../../planning/native-parameter-producer-ids.js';
import {
  selectNativeParameterProducers,
  describePendingNativeProducer,
} from '../../../planning/select-native-parameter-producers.js';
import { createNativeProducerDependenciesSchema } from '../../../../schemas/native-producer-dependencies-schema.js';
import { validateNativeProducerDependencyGraph } from '../../../planning/validate-native-producer-dependency-graph.js';
import { connectionValueFingerprint } from '../../incremental/connection-graph-identity.js';

/** Only requested existing targets appear in the output schema; preserved nodes still participate in cycle checks. */
export function describeWorkflowConnectionNativeDependencies(
  input: WorkflowConnectionNativeRepairInput,
): WorkflowConnectionNativeDependencyDescription {
  const { description, context } = prepareConnectionNativeRepair(input);
  const ids = input.request.request.targets
    .filter((target) => target.stage === 'native-dependencies')
    .map((target) => target.nodeId);
  if (!ids.length)
    throw new Error(
      'Native dependency repair requires an actual native-dependencies target',
    );
  const sources: NativeParameterProducerCandidate[] = [
    ...description.source.input.materials.map(
      (material): NativeParameterProducerCandidate => ({
        nodeId:
          material.status === 'ready'
            ? material.arguments.callId
            : material.callId,
        referenceSources: ['response'],
      }),
    ),
    ...description.source.input.nativeNodes.map((node) => {
      const capability = description.source.input.capabilities.find(
        (entry) => entry.name === node.capability,
      )!;
      const candidate = describePendingNativeProducer(node.id, capability);
      return {
        ...candidate,
        referenceSources: candidate.referenceSources.filter(
          (source) =>
            source !== 'node-output' ||
            context.outputs.some((output) => output.nodeId === node.id),
        ),
      };
    }),
  ];
  return {
    ...context,
    targets: ids.map((nodeId) => {
      const node = context.nativeNodes.find((entry) => entry.id === nodeId)!;
      const capability = description.source.input.capabilities.find(
        (entry) => entry.name === node.capability,
      )!;
      return {
        nodeId,
        description: capability.description,
        sourceNodeIds: selectNativeParameterProducers({
          nodeId,
          capability,
          producers: sources,
        }),
      };
    }),
    previousSources: {
      sourcesByNodeId: Object.fromEntries(
        description.source.context.nodes.map((node) => [
          node.id,
          { sourceNodeIds: nativeParameterProducerIds(node) },
        ]),
      ),
    },
  };
}

export function createWorkflowConnectionNativeDependenciesSchema(
  input: WorkflowConnectionNativeRepairInput,
): z.ZodType<NativeInstanceDependencyProposal> {
  const context = describeWorkflowConnectionNativeDependencies(input);
  return createNativeProducerDependenciesSchema({
    targets: context.targets,
    includeExplanations: input.includeExplanations === true,
  });
}

export function resolveWorkflowConnectionNativeDependencies(
  input: ResolveWorkflowConnectionNativeDependenciesInput,
): WorkflowConnectionNativeDependencies {
  const context = describeWorkflowConnectionNativeDependencies(input);
  const proposal = createNativeProducerDependenciesSchema({
    targets: context.targets,
    includeExplanations: input.includeExplanations === true,
  }).parse(input.proposal);
  if (!isDeepStrictEqual(proposal, input.proposal))
    throw new Error('Native repair producer choices must not be normalized');
  const combined = {
    sourcesByNodeId: {
      ...context.previousSources.sourcesByNodeId,
      ...proposal.sourcesByNodeId,
    },
  };
  validateNativeProducerDependencyGraph(
    Object.keys(combined.sourcesByNodeId),
    combined,
  );
  return structuredClone({
    fingerprint: connectionValueFingerprint({ context, proposal }),
    proposal,
  });
}
