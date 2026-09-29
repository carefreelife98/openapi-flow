import { node, trigger, validateWorkflow, workflow } from '@n8n/workflow-sdk';
import type { WorkflowJSON } from '@n8n/workflow-sdk';
import { responseFieldType } from '../../openapi/request/response-contract.js';
import type { RequiredFields } from '../../types/request-node.js';
import type { BuildSequenceWorkflowInput } from '../../types/sequence-workflow.js';
import { workflowId } from '../common/workflow-id.js';
import { httpRequestNode } from './http-request-node.js';
import { assertionCode } from './response-assertion-code.js';

export function buildSequenceWorkflow({
  baseUrl,
  plan,
  nodes,
  requiredOutputs,
}: BuildSequenceWorkflowInput): WorkflowJSON {
  let built = workflow(workflowId(baseUrl, plan), 'OpenAPI sequence').add(
    trigger({
      type: 'n8n-nodes-base.manualTrigger',
      version: 1,
      config: { id: 'start', name: 'Start', position: [240, 300] },
    }),
  );
  nodes.forEach(
    (
      { operation, id, url, body, headers, expectedBody, authentication },
      index,
    ) => {
      const requiredFields: RequiredFields = {};
      for (const field of requiredOutputs.get(id) ?? []) {
        requiredFields[field] = responseFieldType(operation, field);
      }
      const shouldAssert =
        Object.keys(expectedBody).length > 0 ||
        Object.keys(requiredFields).length > 0;
      const request = httpRequestNode({
        operation,
        id: 'request-' + id,
        name: 'Request ' + id,
        position: [480 + index * 480, 300],
        url,
        body,
        headers,
        authentication,
        shouldAssert,
      });
      built = built.to(request);
      if (!shouldAssert) return;
      const assert = node({
        type: 'n8n-nodes-base.code',
        version: 2,
        config: {
          id: 'assert-' + id,
          name: 'Assert ' + id,
          position: [720 + index * 480, 300],
          parameters: {
            mode: 'runOnceForAllItems',
            jsCode: assertionCode(expectedBody, requiredFields),
          },
        },
      });
      built = built.to(assert);
    },
  );
  const validation = validateWorkflow(built);
  if (!validation.valid)
    throw new Error(
      'n8n SDK validation failed: ' +
        validation.errors.map((error) => error.message).join('; '),
    );
  return built.toJSON();
}
