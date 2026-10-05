import type { ApiBindingMaterial } from '@openapi-flow/core';
import type { WorkflowState } from '../types/workflow-graph.js';

export function createApiBindingMaterials(
  state: WorkflowState,
): ApiBindingMaterial[] {
  if (!state.contracts?.length)
    throw new Error('binding materials require resolved contracts');
  return state.contracts.map((operation, index) => ({
    callId: `${state.workflowId}-request-${index + 1}`,
    operation,
  }));
}
