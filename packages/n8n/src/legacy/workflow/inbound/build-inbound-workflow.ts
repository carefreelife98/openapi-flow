import { node, trigger, validateWorkflow, workflow } from '@n8n/workflow-sdk';
import { UnsupportedOperationError } from '@openapi-flow/core/internal';
import type {
  InboundResult,
  InboundWorkflowContext,
} from '../../../types/legacy/inbound-workflow.js';
import { workflowId } from '../common/workflow-id.js';
import { inboundResponseBody } from './inbound-response.js';

export function buildInboundWorkflow(
  context: InboundWorkflowContext,
): InboundResult {
  const { document, selected, plan } = context;
  const { candidate, operation } = selected;
  if (
    !['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT'].includes(
      candidate.method,
    )
  )
    throw new UnsupportedOperationError(
      candidate.operationRef,
      `operationRef ${candidate.operationRef} uses HTTP method ${candidate.method}, which n8n Webhook node v2.1 does not expose`,
    );
  const effectiveSecurity =
    operation.security === undefined
      ? document.spec.security
      : operation.security;
  if (Array.isArray(effectiveSecurity) && effectiveSecurity.length > 0)
    throw new UnsupportedOperationError(
      candidate.operationRef,
      `operationRef ${candidate.operationRef} requires inbound authentication that has no n8n Webhook credential mapping`,
    );
  const responseBody = inboundResponseBody(context);
  const id = workflowId(plan.webhookPath, plan);
  const start = trigger({
    type: 'n8n-nodes-base.webhook',
    version: 2.1,
    config: {
      id: 'webhook',
      name: 'Webhook',
      webhookId: id,
      position: [240, 300],
      parameters: {
        httpMethod: candidate.method,
        path: plan.webhookPath,
        authentication: 'none',
        responseMode: 'responseNode',
      },
    },
  });
  const respond = node({
    type: 'n8n-nodes-base.respondToWebhook',
    version: 1.5,
    config: {
      id: 'respond',
      name: 'Respond to Webhook',
      position: [480, 300],
      parameters: {
        respondWith: responseBody === undefined ? 'noData' : 'json',
        ...(responseBody === undefined ? {} : { responseBody }),
        options: { responseCode: plan.responseStatus },
      },
    },
  });
  const built = workflow(
    id,
    'OpenAPI ' + candidate.source + ' ' + candidate.method,
  )
    .add(start)
    .to(respond);
  const validation = validateWorkflow(built);
  if (!validation.valid)
    throw new Error(
      'n8n SDK validation failed: ' +
        validation.errors.map((error) => error.message).join('; '),
    );
  return {
    status: 'complete',
    plan,
    evidence: candidate,
    workflow: built.toJSON(),
  };
}
