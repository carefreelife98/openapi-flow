import type { WorkflowDraftInput } from '../../types/workflow-draft.js';
import type { WorkflowPlanNodeContract } from '../../types/workflow-plan.js';
import { resolveWorkflowDraftMaterials } from '../resolve-workflow-draft-materials.js';
import { resolveWorkflowDraftNativeSnapshot } from '../resolve-workflow-draft-native-snapshot.js';
import { createWorkflowNodeContracts } from '../../workflow/create-workflow-node-contracts.js';
import { NativeMaterialResolutionError } from '../../workflow/native-material-resolution-error.js';

/** Actual implementation/OAS contracts for an already validated canonical draft. */
export function resolveWorkflowDraftNodeContracts(
  input: WorkflowDraftInput,
): WorkflowPlanNodeContract[] {
  const { materials, slots } = resolveWorkflowDraftMaterials(input);
  const snapshot = resolveWorkflowDraftNativeSnapshot({
    content: input.draft,
    context: input.context,
    deferredNodeIds: [],
    unavailableApiNodeIds: [],
  });
  if (snapshot.status !== 'ready')
    throw new NativeMaterialResolutionError(snapshot.pending);
  return createWorkflowNodeContracts({
    unresolvedNodes: input.draft.gapNodes,
    materials: materials.map((material) => ({
      operation: material.operation,
      arguments: {
        callId: material.callId,
        values: material.values,
        bindings: material.bindings,
        ...(material.requestMediaType === undefined
          ? {}
          : { requestMediaType: material.requestMediaType }),
        ...(material.requestedInputs === undefined
          ? {}
          : { requestedInputs: material.requestedInputs }),
        unresolvedInputs: slots
          .filter((slot) => slot.callId === material.callId)
          .map((slot) => slot.targetPointer),
      },
    })),
    nativeNodes: input.draft.nativeNodes,
    capabilities: snapshot.capabilities,
  });
}
