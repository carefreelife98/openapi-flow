import type { ApiRequestSchemaInput } from '../types/api-arguments.js';
import type { JsonObject } from '../types/openapi.js';
import {
  bodyMediaSchema,
  parameterSchema,
} from '../arguments/request-contract.js';

/** Full unchanged OAS constraints, unlike the model's partial-value schema. */
export function createApiRequestSchema({
  operation,
  requestMediaType,
}: ApiRequestSchemaInput): JsonObject {
  const properties: JsonObject = {};
  const required: string[] = [];
  for (const location of ['path', 'query', 'header', 'cookie', 'querystring']) {
    const parameters = operation.effective.parameters.filter(
      (item) =>
        item.in === location &&
        !(
          location === 'header' &&
          ['accept', 'content-type', 'authorization'].includes(
            item.name.toLowerCase(),
          )
        ),
    );
    if (!parameters.length) continue;
    const requiredNames = parameters
      .filter((item) => item.required === true)
      .map((item) => item.name);
    Object.defineProperty(properties, location, {
      value: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(
          parameters.map((item) => [
            item.name,
            parameterSchema(item, `${location}.${item.name}`),
          ]),
        ),
        required: requiredNames,
      },
      enumerable: true,
    });
    if (requiredNames.length) required.push(location);
  }
  const body = bodyMediaSchema(operation, requestMediaType);
  if (body !== undefined) {
    properties.body = body;
    const requestBody = operation.operation.requestBody;
    if (
      requestBody &&
      'required' in requestBody &&
      requestBody.required === true
    )
      required.push('body');
  }
  return {
    $schema: operation.openapiVersion.startsWith('3.0.')
      ? 'http://json-schema.org/draft-07/schema#'
      : 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}
