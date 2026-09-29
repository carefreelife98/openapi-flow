import type { JsonObject } from '../../types/openapi.js';

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
