import type { ValidateWorkflowGraphPlanInput } from '../types/workflow-plan.js';
import { validateApiBindingPlan } from '../bindings/validate-api-binding-plan.js';
import { createWorkflowNodeContracts } from './create-workflow-node-contracts.js';
import { validateWorkflowTopology } from './validate-workflow-topology.js';
import { resolveNativeMaterialSnapshot } from './resolve-native-material-snapshot.js';
import { NativeMaterialResolutionError } from './native-material-resolution-error.js';

/** Reject invalid graph proposals; never repair or infer edges. */
export function validateWorkflowGraphPlan({
  plan,
  materials,
  capabilities,
  unresolvedNodes,
}: ValidateWorkflowGraphPlanInput): void {
  const snapshot = resolveNativeMaterialSnapshot({
    apiMaterials: materials.map((material) => ({
      callId: material.arguments.callId,
      operation: material.operation,
      requestMediaType: material.arguments.requestMediaType,
    })),
    nativeOutputs: [],
    deferredNodeIds: [],
    nativeNodes: plan.nativeNodes,
    capabilities,
  });
  if (snapshot.status !== 'ready')
    throw new NativeMaterialResolutionError(snapshot.pending);
  const nativeOutputs = snapshot.outputs;
  if (materials.length)
    validateApiBindingPlan({
      nativeOutputs,
      materials: materials.map((item) => ({
        callId: item.arguments.callId,
        operation: item.operation,
        requestMediaType: item.arguments.requestMediaType,
      })),
      plan: {
        calls: materials.map((item) => ({
          callId: item.arguments.callId,
          bindings: item.arguments.bindings,
        })),
        gaps: [],
      },
    });
  const apiIds = new Set(materials.map((item) => item.arguments.callId));
  if (apiIds.size !== materials.length)
    throw new Error('materials requires unique API callIds');
  const contracts = createWorkflowNodeContracts({
    materials,
    nativeNodes: plan.nativeNodes,
    capabilities: snapshot.capabilities,
    unresolvedNodes,
  });
  validateWorkflowTopology({
    contracts,
    apiIds,
    edges: plan.edges,
    starts: plan.starts,
  });
}
