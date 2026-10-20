import type { z } from 'zod';
import type { NativeInstanceDependencyProposal } from '../types/native-instance-dependencies.js';
import type { WorkflowDraftNativeDependenciesInput } from '../types/workflow-draft-native-dependencies.js';
import { describeWorkflowDraftNativeDependencies } from '../draft/edits/native/additions/resolve-workflow-draft-native-dependencies.js';
import { createNativeProducerDependenciesSchema } from './native-producer-dependencies-schema.js';

export function createWorkflowDraftNativeDependenciesSchema(
  input: WorkflowDraftNativeDependenciesInput,
): z.ZodType<NativeInstanceDependencyProposal> {
  const context = describeWorkflowDraftNativeDependencies(input);
  return createNativeProducerDependenciesSchema({
    targets: context.roles.map((role) => ({
      nodeId: role.nodeId,
      description: `Producer choices for ${role.capability}: ${role.instruction}`,
      sourceNodeIds: context.sourceCandidatesByNodeId[role.nodeId],
    })),
    includeExplanations: context.includeExplanations,
  });
}
