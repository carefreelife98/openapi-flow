import { checkSchemaValue } from '@openapi-flow/core/internal';
import { dereferencedObject, object } from '@openapi-flow/core/internal';
import { UnsupportedOperationError } from '@openapi-flow/core/internal';
import type { InboundWorkflowContext } from '../../../types/legacy/inbound-workflow.js';

export function inboundResponseBody({
  selected,
  plan,
}: InboundWorkflowContext): string | undefined {
  const { candidate, operation } = selected;
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
  return responseBody;
}
