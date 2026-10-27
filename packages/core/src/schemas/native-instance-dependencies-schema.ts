import type { z } from 'zod';
import type { NativeSelectedPlanningInput } from '../types/native-node-planning.js';
import type { NativeInstanceDependencyProposal } from '../types/native-instance-dependencies.js';
import { describeNativeInstanceDependencies } from '../workflow/planning/resolve-native-instance-dependencies.js';
import { createNativeProducerDependenciesSchema } from './native-producer-dependencies-schema.js';

/** All row keys and candidates come from the original selection; the model chooses only actual source roles. */
export function createNativeInstanceDependenciesSchema(
  input: NativeSelectedPlanningInput,
  requireExplanations = true,
): z.ZodType<NativeInstanceDependencyProposal> {
  const context = describeNativeInstanceDependencies(input);
  return createNativeProducerDependenciesSchema(
    {
      targets: context.instances.map((instance) => ({
        nodeId: instance.id,
        description: `Producer choices for ${instance.capability}: ${instance.purpose}`,
        sourceNodeIds: context.sourceCandidatesByNodeId[instance.id],
      })),
      includeExplanations: input.includeExplanations === true,
    },
    requireExplanations,
  );
}
