import type { ApiBindingMaterial } from '@openapi-flow/core';
import type { WorkflowState } from '../types/workflow-graph.js';
import { createSelectedApiCallMaterials } from './create-selected-api-call-materials.js';

export function createApiBindingMaterials(
  state: WorkflowState,
): ApiBindingMaterial[] {
  if (!state.contracts?.length)
    throw new Error('binding materials require resolved contracts');
  if (!state.requestMediaTypes)
    throw new Error('binding materials require request media selection');
  const requestMediaTypes = state.requestMediaTypes;
  return createSelectedApiCallMaterials(state).map((material) => {
    const { callId } = material;
    const selected = requestMediaTypes.find((item) => item.callId === callId);
    if (!selected)
      throw new Error(`request media selection is missing ${callId}`);
    return {
      ...material,
      ...(selected.requestMediaType === undefined
        ? {}
        : { requestMediaType: selected.requestMediaType }),
    };
  });
}
