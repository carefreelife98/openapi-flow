import type { ApiRequestSchemaInput } from '../types/api-arguments.js';
import type { JsonObject } from '../types/openapi.js';
import {
  bodyMediaSchema,
  parameterSchema,
} from '../arguments/request-contract.js';
import { createOasValueValidator } from '../openapi/common/create-oas-value-validator.js';

/** Full unchanged OAS constraints, unlike the model's partial-value schema. */
export function createApiRequestSchema({
  operation,
  requestMediaType,
}: ApiRequestSchemaInput): JsonObject {
  const properties: JsonObject = {};
  const dialect = operation.openapiVersion.startsWith('3.0.')
    ? 'openapi-3.0'
    : 'draft-2020-12';
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
            createOasValueValidator(
              parameterSchema(item, `${location}.${item.name}`),
              dialect,
              `${operation.key.operationRef}/${location}/${item.name}`,
            ).schema,
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
    properties.body = createOasValueValidator(
      body,
      dialect,
      `${operation.key.operationRef}/body`,
    ).schema;
    const requestBody = operation.operation.requestBody;
    if (
      requestBody &&
      'required' in requestBody &&
      requestBody.required === true
    )
      required.push('body');
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}
