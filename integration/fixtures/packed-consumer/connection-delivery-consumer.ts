import assert from 'node:assert/strict';
import {
  inspectWorkflowConnectionDelivery,
  NativeParameterMaterialUnavailableError,
} from '@openapi-flow/core';
import type {
  WorkflowConnectionDelivery,
  NativeParameterValuePolicy,
} from '@openapi-flow/core';
import {
  compileWorkflowConnectionDelivery,
  createWorkflowConnectionDeliveryApiNodes,
} from '@openapi-flow/n8n';
import type {
  CreateWorkflowConnectionDeliveryApiNodesInput,
  N8nWorkflowConnectionDelivery,
} from '@openapi-flow/n8n';

export function compileConsumerDelivery(
  input: CreateWorkflowConnectionDeliveryApiNodesInput,
): N8nWorkflowConnectionDelivery {
  const inspection: WorkflowConnectionDelivery =
    inspectWorkflowConnectionDelivery(input);
  assert.equal(inspection.sessionId, input.session.id);
  return compileWorkflowConnectionDelivery({
    ...input,
    id: 'consumer-delivery',
    name: 'Consumer delivery',
    apiNodes: createWorkflowConnectionDeliveryApiNodes(input),
  });
}
const policy: NativeParameterValuePolicy = {
  businessInputPaths: ['/value'],
  generatedTextPaths: ['/label'],
};
assert.equal(policy.generatedTextPaths[0], '/label');
assert.equal(
  new NativeParameterMaterialUnavailableError('node', 'Missing output contract')
    .nodeId,
  'node',
);
