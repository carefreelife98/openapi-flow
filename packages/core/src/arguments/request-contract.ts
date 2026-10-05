import type { ApiOperationContract } from '../types/api-operation.js';
import type { JsonObject } from '../types/openapi.js';
import { object } from '../openapi/common/parse-spec-utils.js';

export function bodyMediaSchema(
  operation: ApiOperationContract,
  mediaType?: string,
): JsonObject | boolean | undefined {
  if (operation.operation.requestBody === undefined) {
    if (mediaType !== undefined)
      throw new Error(
        `${operation.key.operationRef} has no requestBody for ${mediaType}`,
      );
    return undefined;
  }
  const body = object(
    operation.operation.requestBody,
    `${operation.key.operationRef}.requestBody`,
  );
  const content = object(
    body.content,
    `${operation.key.operationRef}.requestBody.content`,
  );
  const names = Object.keys(content);
  const selected =
    mediaType === undefined && names.length === 1 ? names[0] : mediaType;
  if (selected === undefined)
    throw new Error(
      `${operation.key.operationRef}.requestMediaType must explicitly select one of ${names.join(', ')}`,
    );
  if (!Object.hasOwn(content, selected))
    throw new Error(
      `${operation.key.operationRef}.requestBody.content has no ${selected}`,
    );
  const media = object(
    content[selected],
    `${operation.key.operationRef}.requestBody.content.${selected}`,
  );
  if (media.schema === undefined) return true;
  return typeof media.schema === 'boolean'
    ? media.schema
    : object(media.schema, `${selected}.schema`);
}

export function parameterSchema(
  parameter: JsonObject,
  source: string,
): JsonObject | boolean {
  if (parameter.schema !== undefined)
    return typeof parameter.schema === 'boolean'
      ? parameter.schema
      : object(parameter.schema, `${source}.schema`);
  const content = object(parameter.content, `${source}.content`);
  const names = Object.keys(content);
  if (names.length !== 1)
    throw new Error(`${source}.content must have one media type`);
  const media = object(content[names[0]], `${source}.content.${names[0]}`);
  return media.schema === undefined
    ? true
    : typeof media.schema === 'boolean'
      ? media.schema
      : object(media.schema, `${source}.schema`);
}
