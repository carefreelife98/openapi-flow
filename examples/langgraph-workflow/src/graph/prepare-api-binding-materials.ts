import type { ApiBindingMaterial } from '@openapi-flow/core';
import type { WorkflowState } from '../types/workflow-graph.js';

export function createApiBindingMaterials(
  state: WorkflowState,
): ApiBindingMaterial[] {
  if (!state.contracts?.length)
    throw new Error('binding materials require resolved contracts');
  if (!state.requestMediaTypes)
    throw new Error('binding materials require request media selection');
  const requestMediaTypes = state.requestMediaTypes;
  return state.contracts.map((operation, index) => {
    const callId = `${state.workflowId}-request-${index + 1}`;
    const selected = requestMediaTypes.find((item) => item.callId === callId);
    if (!selected)
      throw new Error(`request media selection is missing ${callId}`);
    return {
      callId,
      operation,
      ...(selected.requestMediaType === undefined
        ? {}
        : { requestMediaType: selected.requestMediaType }),
    };
  });
}
