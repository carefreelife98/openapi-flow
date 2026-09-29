import type { JsonObject } from '../../types/openapi.js';
import type { Operation } from '../../types/request.js';
import { checkSchemaValue } from '../common/check-schema-value.js';
import { scalarResponseSchema } from './scalar-response-schema.js';

export function responseFieldNames(operation: Operation): string[] {
  return [...new Set(Object.values(operation.responses).flatMap(Object.keys))];
}

export function responseFieldSchemas(
  operation: Operation,
  field: string,
): (JsonObject | boolean)[] {
  return Object.values(operation.responses).flatMap((properties) =>
    Object.hasOwn(properties, field) ? [properties[field]] : [],
  );
}

export function validateResponseField(
  operation: Operation,
  field: string,
  value: unknown,
  source: string,
): void {
  const schemas = responseFieldSchemas(operation, field);
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
  const schemas = responseFieldSchemas(operation, field);
  if (schemas.length === 0)
    throw new Error('prior response field ' + field + ' is not in the OAS');
  const types = new Set(
    schemas.map(
      (schema) =>
        scalarResponseSchema(
          schema,
          'operationRef ' + operation.operationRef + ' response field ' + field,
          operation.operationRef,
        ).type,
    ),
  );
  if (types.size !== 1)
    throw new Error(
      'prior response field ' + field + ' has ambiguous OAS types',
    );
  return [...types][0];
}
