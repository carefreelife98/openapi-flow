import { node, trigger, validateWorkflow, workflow } from '@n8n/workflow-sdk';
import { checkSchemaValue } from '../openapi/check-schema-value.js';
import { inboundOperationSourcesFromDocument } from '../openapi/parse-inbound-operations.js';
import { dereferencedObject, object } from '../openapi/parse-spec-utils.js';
import { UnsupportedOperationError } from '../openapi/unsupported-operation-error.js';
import { validatedDocument } from '../openapi/validate-spec.js';
import type { InboundRequest, InboundResult } from '../types/workflow.js';
import { assertSerializablePlan, isObject } from '../utils/validation.js';
import { workflowId } from '../utils/workflow-id.js';

export async function compileInboundWorkflow({
  spec,
  plan,
}: InboundRequest): Promise<InboundResult> {
  if (
    !isObject(plan) ||
    plan.version !== '1' ||
    typeof plan.goal !== 'string' ||
    !plan.goal.trim() ||
    typeof plan.operationRef !== 'string' ||
    typeof plan.webhookPath !== 'string' ||
    !plan.webhookPath.trim() ||
    !Number.isInteger(plan.responseStatus) ||
    plan.responseStatus < 100 ||
    plan.responseStatus > 599
  )
    throw new Error(
      'plan must contain version 1, goal, operationRef, webhookPath, and responseStatus',
    );
  assertSerializablePlan(plan);
  const document = await validatedDocument(spec);
  const selected = inboundOperationSourcesFromDocument(document).find(
    ({ candidate }) => candidate.operationRef === plan.operationRef,
  );
  if (!selected)
    throw new Error(
      'plan.operationRef is not in spec.webhooks or callbacks: ' +
        plan.operationRef,
    );
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
  const responses = object(
    operation.responses,
    `operationRef ${candidate.operationRef}.responses`,
  );
  const status = String(plan.responseStatus);
  const responseKey = Object.hasOwn(responses, status)
    ? status
    : Object.hasOwn(responses, status[0] + 'XX')
      ? status[0] + 'XX'
      : Object.hasOwn(responses, 'default')
        ? 'default'
        : undefined;
  if (responseKey === undefined)
    throw new Error(
      `plan.responseStatus ${status} is not declared by operationRef ${candidate.operationRef}`,
    );
  const response = dereferencedObject(
    responses[responseKey],
    `operationRef ${candidate.operationRef}.responses.${responseKey}`,
  );
  if (response.headers !== undefined) {
    const headers = object(
      response.headers,
      `operationRef ${candidate.operationRef}.responses.${responseKey}.headers`,
    );
    for (const [name, raw] of Object.entries(headers)) {
      const header = dereferencedObject(
        raw,
        `operationRef ${candidate.operationRef}.responses.${responseKey}.headers.${name}`,
      );
      if (header.required === true)
        throw new UnsupportedOperationError(
          candidate.operationRef,
          `operationRef ${candidate.operationRef} response header ${name} needs a host value`,
        );
    }
  }
  let responseBody: string | undefined;
  if (plan.responseBody !== undefined) {
    const content = object(
      response.content,
      `operationRef ${candidate.operationRef}.responses.${responseKey}.content`,
    );
    const declared = Object.keys(content);
    const mediaType =
      plan.responseMediaType ??
      (declared.length === 1 ? declared[0] : undefined);
    if (mediaType === undefined)
      throw new Error(
        'plan.responseMediaType is required for this response body',
      );
    if (!Object.hasOwn(content, mediaType))
      throw new Error(
        `plan.responseMediaType ${mediaType} is not declared by operationRef ${candidate.operationRef}`,
      );
    if (mediaType !== 'application/json')
      throw new UnsupportedOperationError(
        candidate.operationRef,
        `operationRef ${candidate.operationRef} response media type ${mediaType} has no n8n mapping`,
      );
    const media = dereferencedObject(
      content[mediaType],
      `operationRef ${candidate.operationRef}.responses.${responseKey}.content.${mediaType}`,
    );
    if (media.schema !== undefined) {
      const schema =
        typeof media.schema === 'boolean'
          ? media.schema
          : dereferencedObject(
              media.schema,
              `operationRef ${candidate.operationRef}.responses.${responseKey}.content.${mediaType}.schema`,
            );
      checkSchemaValue(plan.responseBody, schema, 'plan.responseBody');
    }
    responseBody = JSON.stringify(plan.responseBody);
  } else if (plan.responseMediaType !== undefined) {
    throw new Error('plan.responseMediaType requires plan.responseBody');
  }
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
