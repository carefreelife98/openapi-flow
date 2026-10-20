import type { ApiBindingMaterial } from '@openapi-flow/core';
import type { WorkflowState } from '../types/workflow-graph.js';

/** Selected-array positions allocate instance identities, never execution order. */
export function createSelectedApiCallMaterials(
  state: WorkflowState,
): ApiBindingMaterial[] {
  if (
    !state.contracts ||
    !state.selection ||
    state.selection.operations.length !== state.contracts.length
  )
    throw new Error(
      'call materials require matching selected call roles and resolved contracts',
    );
  if (typeof state.workflowId !== 'string' || !state.workflowId.trim())
    throw new Error('selected call materials require workflowId');
  const selected = state.selection.operations;
  return state.contracts.map((operation, index) => {
    const callId = `${state.workflowId}-request-${index + 1}`;
    const role = selected[index];
    if (
      role.key.documentId !== operation.key.documentId ||
      role.key.snapshotId !== operation.key.snapshotId ||
      role.key.operationRef !== operation.key.operationRef ||
      typeof role.purpose !== 'string' ||
      !role.purpose.trim()
    )
      throw new Error(
        `selected role for ${callId} does not match its resolved original OAS contract`,
      );
    return { callId, operation, purpose: role.purpose };
  });
}
