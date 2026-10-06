import { z } from 'zod';
import type { JsonObject } from '../types/openapi.js';
import type { SchemaDialect } from '../types/schema-dialect.js';
import type { Operation, OperationParameter } from '../types/request.js';
import { isObject } from '../utils/is-object.js';
import { createOasValueSchema } from './create-oas-value-schema.js';

function parameterGroup(
  parameters: OperationParameter[],
  location: OperationParameter['in'],
  dialect: SchemaDialect,
): z.ZodType | undefined {
  const fields = parameters
    .filter((parameter) => parameter.in === location)
    .map(
      (parameter) =>
        [
          parameter.name,
          createOasValueSchema(
            optionalRequestProperties(parameter.schema) as JsonObject | boolean,
            dialect,
            `${location}.${parameter.name}`,
          )
            .describe(
              `Value explicitly stated for ${location} parameter ${parameter.name}`,
            )
            .optional(),
        ] as const,
    );
  if (fields.length === 0) return undefined;
  return z.object(Object.fromEntries(fields)).strict().optional();
}

// The model may omit values absent from the scenario. The compiler still checks
// the unchanged OAS schema and reports missing required request values.
export function optionalRequestProperties(schema: unknown): unknown {
  if (!isObject(schema)) return schema;
  const result: JsonObject = { ...schema };
  delete result.required;
  delete result.default;
  for (const key of [
    'properties',
    'patternProperties',
    '$defs',
    'definitions',
    'dependentSchemas',
  ]) {
    if (!isObject(result[key])) continue;
    result[key] = Object.fromEntries(
      Object.entries(result[key]).map(([name, value]) => [
        name,
        optionalRequestProperties(value),
      ]),
    );
  }
  for (const key of [
    'items',
    'additionalProperties',
    'not',
    'if',
    'then',
    'else',
    'contains',
    'unevaluatedProperties',
    'propertyNames',
  ]) {
    if (result[key] !== undefined)
      result[key] = optionalRequestProperties(result[key]);
  }
  for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
    if (Array.isArray(result[key]))
      result[key] = result[key].map(optionalRequestProperties);
  }
  return result;
}

function requestBodySchema(
  operation: Operation,
  dialect: SchemaDialect,
  requestMediaType?: string,
): z.ZodType | undefined {
  if (!operation.body) return undefined;
  const mediaTypes = Object.entries(operation.body.mediaTypes).filter(
    ([mediaType]) =>
      requestMediaType === undefined || mediaType === requestMediaType,
  );
  if (requestMediaType !== undefined && mediaTypes.length === 0)
    throw new Error(
      `operationRef ${operation.operationRef}.requestBody has no media type ${requestMediaType}`,
    );
  if (mediaTypes.length === 0)
    throw new Error(
      `operationRef ${operation.operationRef}.requestBody.content has no media types`,
    );
  const schemas = mediaTypes.map(([mediaType, media]) =>
    media.schema === undefined
      ? z.json()
      : createOasValueSchema(
          optionalRequestProperties(media.schema) as JsonObject | boolean,
          dialect,
          `operationRef ${operation.operationRef}.requestBody.${mediaType}.schema`,
        ),
  );
  const body = schemas
    .slice(1)
    .reduce<z.ZodType>(
      (combined, schema) => z.union([combined, schema]),
      schemas[0],
    );
  return body
    .describe('Request body values explicitly stated in the scenario')
    .optional();
}

export function createOperationPlanSchema(
  operation: Operation,
  openapiVersion: string,
  requestMediaType?: string,
) {
  let dialect: SchemaDialect;
  if (openapiVersion.startsWith('3.0.')) dialect = 'openapi-3.0';
  else if (
    openapiVersion.startsWith('3.1.') ||
    openapiVersion.startsWith('3.2.')
  )
    dialect = 'draft-2020-12';
  else
    throw new Error(
      `spec.openapi is not a supported OAS version: ${openapiVersion}`,
    );
  const groups = Object.fromEntries(
    (['path', 'query', 'header', 'cookie'] as const)
      .map(
        (location) =>
          [
            location,
            parameterGroup(operation.parameters, location, dialect),
          ] as const,
      )
      .filter(([, schema]) => schema !== undefined),
  );
  const body = requestBodySchema(operation, dialect, requestMediaType);
  return z
    .object({
      inputs: z.object({ ...groups, ...(body ? { body } : {}) }).strict(),
    })
    .strict()
    .describe('Only request values explicitly stated in the scenario');
}
