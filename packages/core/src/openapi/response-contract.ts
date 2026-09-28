import type {
  JsonObject,
  Operation,
  ResponseProperties,
} from '../types/openapi.js';
import { checkSchemaValue } from './check-schema-value.js';
import { scalarSchema } from './parse-spec-utils.js';

export function responseProperties(
  operation: Operation,
  status?: number,
): ResponseProperties[] {
  if (status === undefined) return Object.values(operation.responses);
  const code = String(status);
  const range = String(Math.floor(status / 100)) + 'XX';
  const selected = Object.hasOwn(operation.responses, code)
    ? code
    : Object.hasOwn(operation.responses, range)
      ? range
      : 'default';
  return [operation.responses[selected]];
}

export function responseFieldNames(operation: Operation): string[] {
  return [...new Set(Object.values(operation.responses).flatMap(Object.keys))];
}

export function responseFieldSchemas(
  operation: Operation,
  field: string,
  status?: number,
): (JsonObject | boolean)[] {
  return responseProperties(operation, status).flatMap((properties) =>
    Object.hasOwn(properties, field) ? [properties[field]] : [],
  );
}

export function validateResponseField(
  operation: Operation,
  field: string,
  value: unknown,
  source: string,
  status?: number,
): void {
  const schemas = responseFieldSchemas(operation, field, status);
  if (schemas.length === 0)
    throw new Error(source + ' is not in the OAS response schema');
  for (const schema of schemas) {
    try {
      checkSchemaValue(value, schema, source);
      return;
    } catch {
      // Another declared response may define this field differently.
    }
  }
  throw new Error(source + ' does not match the OAS schema');
}

export function responseFieldType(operation: Operation, field: string): string {
  const schemas = responseFieldSchemas(operation, field, operation.status);
  if (schemas.length === 0)
    throw new Error('prior response field ' + field + ' is not in the OAS');
  const types = new Set(
    schemas.map(
      (schema) =>
        scalarSchema(
          schema,
          'operationRef ' + operation.operationRef + ' response field ' + field,
        ).type,
    ),
  );
  if (types.size !== 1)
    throw new Error(
      'prior response field ' + field + ' has ambiguous OAS types',
    );
  return [...types][0];
}
