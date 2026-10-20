import type {
  WorkflowDraftNativeNodeAdditionInput,
  WorkflowDraftNativeNodeAdditionReadiness,
} from '../../../../types/workflow-draft-native-node-addition.js';
import { resolveNativeNodeAdditionMaterials } from './resolve-native-node-addition-materials.js';

/** Availability is not a valid parameter choice, graph edge or execution result. No model call. */
export function describeWorkflowDraftNativeNodeAdditionReadiness(
  input: WorkflowDraftNativeNodeAdditionInput,
): WorkflowDraftNativeNodeAdditionReadiness {
  const {
    nodeId,
    definition,
    missingContext,
    pendingSourceNodeIds,
    sourceDependencies,
  } = resolveNativeNodeAdditionMaterials(input);
  return {
    status:
      missingContext.length || pendingSourceNodeIds.length
        ? 'requires-context'
        : 'ready',
    nodeId,
    capability: definition.name,
    missingContext,
    ...(sourceDependencies === undefined ? {} : { pendingSourceNodeIds }),
  };
}
