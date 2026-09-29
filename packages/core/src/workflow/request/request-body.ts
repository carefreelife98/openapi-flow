import { checkSchemaValue } from '../../openapi/common/check-schema-value.js';
import { UnsupportedOperationError } from '../../openapi/common/unsupported-operation-error.js';
import { serializeFormBody } from '../../openapi/request/serialize-form-body.js';
import type { Operation } from '../../types/request.js';
import type { PreparedRequestBody } from '../../types/request-node.js';
import type { InputValues } from '../../types/request-workflow.js';
import { isObject } from '../../utils/is-object.js';
import { looksLikeCredential } from './credential-binding.js';

export function makeBody(
  operation: Operation,
  inputs: InputValues,
  missing: string[],
  requestMediaType?: string,
): PreparedRequestBody | undefined {
  if (!operation.body) {
    if (requestMediaType !== undefined)
      throw new Error(
        'plan.requestMediaType is not declared by the OAS operation',
      );
    return undefined;
  }
  if (
    requestMediaType !== undefined &&
    !Object.hasOwn(operation.body.mediaTypes, requestMediaType)
  ) {
    throw new Error(
      'plan.requestMediaType is not declared by the OAS operation',
    );
  }
  const value = inputs.body;
  if (value === undefined) {
    if (operation.body.required) missing.push('body');
    return undefined;
  }
  const declared = Object.keys(operation.body.mediaTypes);
  const mediaType =
    requestMediaType ?? (declared.length === 1 ? declared[0] : undefined);
  if (mediaType === undefined) {
    missing.push('requestMediaType');
    return undefined;
  }
  const media = operation.body.mediaTypes[mediaType];
  if (
    mediaType !== 'application/json' &&
    mediaType !== 'application/x-www-form-urlencoded'
  ) {
    throw new UnsupportedOperationError(
      operation.operationRef,
      `operationRef ${operation.operationRef}.requestBody media type ${mediaType} has no n8n mapping`,
    );
  }
  if (isObject(value)) {
    for (const name of Object.keys(value)) {
      if (looksLikeCredential(name)) {
        throw new Error(
          'plan.inputs.body.' +
            name +
            ' looks like a credential; bind an existing n8n credential through credentialBindings instead',
        );
      }
    }
    if (
      typeof media.schema === 'object' &&
      Array.isArray(media.schema.required)
    ) {
      for (const name of media.schema.required) {
        if (typeof name === 'string' && !Object.hasOwn(value, name)) {
          missing.push('body.' + name);
        }
      }
    }
  }
  if (missing.some((key) => key.startsWith('body.'))) return undefined;
  if (media.schema !== undefined)
    checkSchemaValue(value, media.schema, 'plan.inputs.body');
  if (mediaType === 'application/json') {
    return { contentType: 'json', value: JSON.stringify(value) };
  }
  if (!isObject(value)) {
    throw new Error(
      'plan.inputs.body must be an object for application/x-www-form-urlencoded',
    );
  }
  return {
    contentType: 'form-urlencoded',
    value: serializeFormBody(operation.operationRef, media, value),
  };
}
