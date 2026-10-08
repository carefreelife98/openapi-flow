import type { ValidateWorkflowGraphPlanInput } from '../types/workflow-plan.js';
import { validateApiBindingPlan } from '../bindings/validate-api-binding-plan.js';
import { createWorkflowNodeContracts } from './create-workflow-node-contracts.js';
import { validateWorkflowTopology } from './validate-workflow-topology.js';
import { createNativeOutputContracts } from './create-native-output-contracts.js';

/** Reject invalid graph proposals; never repair or infer edges. */
export function validateWorkflowGraphPlan({
  plan,
  materials,
  capabilities,
}: ValidateWorkflowGraphPlanInput): void {
  validateApiBindingPlan({
    nativeOutputs: createNativeOutputContracts({
      nativeNodes: plan.nativeNodes,
      capabilities,
    }),
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
  if (!materials.length || apiIds.size !== materials.length)
    throw new Error('materials requires unique API callIds');
  const contracts = createWorkflowNodeContracts({
    materials,
    nativeNodes: plan.nativeNodes,
    capabilities,
  });
  validateWorkflowTopology({
    contracts,
    apiIds,
    edges: plan.edges,
    starts: plan.starts,
  });
}
