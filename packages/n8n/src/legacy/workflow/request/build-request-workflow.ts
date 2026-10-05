import { node, trigger, validateWorkflow, workflow } from '@n8n/workflow-sdk';
import type { WorkflowJSON } from '@n8n/workflow-sdk';
import type { BuildRequestWorkflowInput } from '../../../types/legacy/request-workflow.js';
import { workflowId } from '../common/workflow-id.js';
import { httpRequestNode } from './http-request-node.js';
import { assertionCode } from './response-assertion-code.js';

export function buildRequestWorkflow({
  baseUrl,
  plan,
  operation,
  url,
  body,
  headers,
  authentication,
  expectedBody,
}: BuildRequestWorkflowInput): WorkflowJSON {
  const shouldAssert = Object.keys(expectedBody).length > 0;
  const start = trigger({
    type: 'n8n-nodes-base.manualTrigger',
    version: 1,
    config: { id: 'start', name: 'Start', position: [240, 300] },
  });
  const request = httpRequestNode({
    operation,
    id: 'request',
    name: operation.method + ' ' + operation.path,
    position: [480, 300],
    url,
    body,
    headers,
    authentication,
    shouldAssert,
  });
  const built = workflow(
    workflowId(baseUrl, plan),
    'OpenAPI ' + operation.method + ' ' + operation.path,
  )
    .add(start)
    .to(request);
  const result = shouldAssert
    ? built.to(
        node({
          type: 'n8n-nodes-base.code',
          version: 2,
          config: {
            id: 'assert',
            name: 'Assert response',
            position: [720, 300],
            parameters: {
              mode: 'runOnceForAllItems',
              jsCode: assertionCode(expectedBody),
            },
          },
        }),
      )
    : built;
  const validation = validateWorkflow(result);
  if (!validation.valid) {
    throw new Error(
      'n8n SDK validation failed: ' +
        validation.errors.map((error) => error.message).join('; '),
    );
  }
  return result.toJSON();
}
