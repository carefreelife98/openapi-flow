import type { ReviewableWorkflowGraphPlan } from '@openapi-flow/core';
import type { OrchestrateWorkflowInput } from '../types/workflow-orchestration.js';
import { planNativeNodes } from './plan-native-nodes.js';
import { planWorkflowConnections } from './plan-workflow-connections.js';
import { assembleNativeNodeMaterials } from './assemble-native-node-materials.js';
import { prepareWorkflowConnectionMaterials } from './prepare-workflow-connection-materials.js';

/** Optional material groups mean absence, never an implicit capability registry. */
export async function orchestrateWorkflow(
  input: OrchestrateWorkflowInput,
): Promise<ReviewableWorkflowGraphPlan> {
  if (!input.workflowId?.trim())
    throw new Error('orchestrateWorkflow.workflowId is required');
  prepareWorkflowConnectionMaterials({
    ...input,
    nativeNodes: input.preparedNativeNodes,
  });
  const nativePlan = await planNativeNodes({
    planId: `${input.workflowId}-native`,
    scenario: input.scenario,
    model: input.model,
    capabilities: input.capabilities,
    preparedNativeNodes: input.preparedNativeNodes,
    apiMaterials: input.materials?.map((material) => ({
      callId:
        material.status === 'ready'
          ? material.arguments.callId
          : material.callId,
      operation: material.operation,
    })),
  });
  return planWorkflowConnections({
    ...input,
    nativeNodes: assembleNativeNodeMaterials(
      input.preparedNativeNodes ?? [],
      nativePlan.nativeNodes,
    ),
    gaps: [...(input.gaps ?? []), ...nativePlan.gaps],
  });
}
