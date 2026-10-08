import {
  createReviewableNodeContracts,
  createNativeOutputContracts,
  validateWorkflowEdges,
  validateApiArguments,
  validateApiBindingAssignments,
} from '@openapi-flow/core';
import type { ReviewableWorkflowGraphPlan } from '@openapi-flow/core';
import type {
  PlanWorkflowConnectionsInput,
  WorkflowConnectionMaterials,
} from '../types/workflow-orchestration.js';

/** Validate immutable supplied data before paying for any orchestration model call. */
export function prepareWorkflowConnectionMaterials(
  input: PlanWorkflowConnectionsInput,
): WorkflowConnectionMaterials {
  const materials = input.materials ?? [];
  const capabilities = input.capabilities ?? [];
  const nativeNodes = input.nativeNodes ?? [];
  const gaps = input.gaps ?? [];
  const edges = input.edges ?? [];
  const nativeOutputs = createNativeOutputContracts({
    nativeNodes,
    capabilities,
  });
  for (const material of materials) {
    if (material.status !== 'ready') continue;
    const args = material.arguments;
    const validation = validateApiArguments({
      operation: material.operation,
      ...args,
    });
    if (args.unresolvedInputs.length || !validation.valid)
      throw new Error(
        `materials[${args.callId}] has unresolved OAS request inputs`,
      );
  }
  if (materials.length)
    validateApiBindingAssignments({
      nativeOutputs,
      materials: materials.map((material) => ({
        operation: material.operation,
        callId:
          material.status === 'ready'
            ? material.arguments.callId
            : material.callId,
        requestMediaType:
          material.status === 'ready'
            ? material.arguments.requestMediaType
            : material.requestMediaType,
      })),
      calls: materials.map((material) => ({
        callId:
          material.status === 'ready'
            ? material.arguments.callId
            : material.callId,
        bindings:
          material.status === 'ready'
            ? material.arguments.bindings
            : material.bindings,
      })),
    });
  const plan: ReviewableWorkflowGraphPlan = {
    nativeNodes,
    gaps,
    edges,
    starts: [],
    blockedCalls: materials.flatMap((material) =>
      material.status === 'blocked'
        ? [{ callId: material.callId, gapIds: material.gapIds }]
        : [],
    ),
  };
  const contracts = createReviewableNodeContracts({
    materials,
    capabilities,
    plan,
  });
  validateWorkflowEdges({ contracts, edges });
  return { materials, capabilities, nativeNodes, gaps, edges, contracts };
}
