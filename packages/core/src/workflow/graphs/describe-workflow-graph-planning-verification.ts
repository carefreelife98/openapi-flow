import type {
  WorkflowGraphPlanningSnapshot,
  WorkflowGraphPlanningVerification,
} from '../../types/workflow-graph-planning.js';
import type { WorkflowGraphPlan } from '../../types/workflow-plan.js';
import type { ReviewableWorkflowGraphPlan } from '../../types/reviewable-workflow.js';
import { createWorkflowNodeContracts } from '../create-workflow-node-contracts.js';
import { createReviewableNodeContracts } from '../create-reviewable-node-contracts.js';
import { createNativeOutputContracts } from '../create-native-output-contracts.js';
import { resolveNativeMaterialSnapshot } from '../resolve-native-material-snapshot.js';
import { NativeMaterialResolutionError } from '../native-material-resolution-error.js';

/** Distinguish a legacy non-executable gap report from a fully validated graph. */
export function describeWorkflowGraphPlanningVerification(
  snapshot: WorkflowGraphPlanningSnapshot,
  plan: WorkflowGraphPlan | ReviewableWorkflowGraphPlan,
): WorkflowGraphPlanningVerification {
  if (snapshot.mode === 'reviewable') {
    if (!('blockedCalls' in plan))
      throw new Error('reviewable graph verification requires blockedCalls');
    return {
      status: 'validated',
      contracts: createReviewableNodeContracts({ ...snapshot, plan }),
      outputs: createNativeOutputContracts({
        nativeNodes: plan.nativeNodes,
        capabilities: snapshot.capabilities,
      }),
    };
  }
  if (plan.gaps.length) return { status: 'needs-review' };
  const materials = snapshot.materials.map((material) => {
    if (material.status !== 'ready')
      throw new Error('executable graph verification requires ready materials');
    return material;
  });
  const native = resolveNativeMaterialSnapshot({
    apiMaterials: materials.map((material) => ({
      callId: material.arguments.callId,
      operation: material.operation,
      requestMediaType: material.arguments.requestMediaType,
    })),
    nativeOutputs: [],
    deferredNodeIds: [],
    nativeNodes: plan.nativeNodes,
    capabilities: snapshot.capabilities,
  });
  if (native.status !== 'ready')
    throw new NativeMaterialResolutionError(native.pending);
  return {
    status: 'validated',
    contracts: createWorkflowNodeContracts({
      materials,
      nativeNodes: plan.nativeNodes,
      capabilities: native.capabilities,
    }),
    outputs: native.outputs,
  };
}
