import type { JsonObject } from '../../types/openapi.js';
import type { OperationBody, OperationBodyMedia } from '../../types/request.js';
import { dereferencedObject, object } from '../common/parse-spec-utils.js';

export function parseRequestBody(
  operation: JsonObject,
  operationRef: string,
): OperationBody | undefined {
  if (operation.requestBody === undefined) return undefined;
  const requestBody = dereferencedObject(
    operation.requestBody,
    `operationRef ${operationRef}.requestBody`,
  );
  const content = object(
    requestBody.content,
    `operationRef ${operationRef}.requestBody.content`,
  );
  const mediaTypes: Record<string, OperationBodyMedia> = Object.create(null);
  for (const [mediaType, value] of Object.entries(content)) {
    const media = object(
      value,
      `operationRef ${operationRef}.requestBody.${mediaType}`,
    );
    const bodySchema =
      media.schema === undefined
        ? undefined
        : typeof media.schema === 'boolean'
          ? media.schema
          : dereferencedObject(
              media.schema,
              `operationRef ${operationRef}.requestBody.${mediaType}.schema`,
            );
    const properties =
      typeof bodySchema !== 'object' || bodySchema.properties === undefined
        ? {}
        : object(
            bodySchema.properties,
            `operationRef ${operationRef}.requestBody.${mediaType}.schema.properties`,
          );
    mediaTypes[mediaType] = {
      schema: bodySchema,
      properties,
      ...(media.encoding === undefined
        ? {}
        : {
            encoding: object(
              media.encoding,
              `operationRef ${operationRef}.requestBody.${mediaType}.encoding`,
            ),
          }),
    };
  }
  return { required: requestBody.required === true, mediaTypes };
}
