import type { JsonObject, Scalar, ScalarSchema } from '../types/openapi.js';
import { UnsupportedOperationError } from './unsupported-operation-error.js';

export function object(value: unknown, source: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${source} must be an object`);
  }
  return value as JsonObject;
}

export function dereferencedObject(value: unknown, source: string): JsonObject {
  const item = object(value, source);
  if (item.$ref !== undefined)
    throw new Error(`${source} has an unresolved $ref`);
  return item;
}

export function scalarSchema(
  value: unknown,
  source: string,
  operationRef: string,
): ScalarSchema {
  const schema = dereferencedObject(value, source);
  if (
    !['string', 'integer', 'number', 'boolean'].includes(String(schema.type))
  ) {
    throw new UnsupportedOperationError(
      operationRef,
      `${source} must be a primitive schema`,
    );
  }
  if (
    schema.enum !== undefined &&
    (!Array.isArray(schema.enum) ||
      schema.enum.length === 0 ||
      schema.enum.some(
        (entry) =>
          typeof entry !== 'string' &&
          typeof entry !== 'number' &&
          typeof entry !== 'boolean',
      ))
  ) {
    throw new UnsupportedOperationError(
      operationRef,
      `${source}.enum must contain primitive values`,
    );
  }
  return {
    type: schema.type as string,
    enum: schema.enum as Scalar[] | undefined,
  };
}
