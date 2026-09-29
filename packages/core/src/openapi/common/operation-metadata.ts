import type { JsonObject, OperationMetadata } from '../../types/openapi.js';

export function operationMetadata(
  operation: JsonObject,
  source: string,
): OperationMetadata {
  if (
    operation.operationId !== undefined &&
    typeof operation.operationId !== 'string'
  ) {
    throw new Error(`${source}.operationId must be a string`);
  }
  if (
    operation.tags !== undefined &&
    (!Array.isArray(operation.tags) ||
      !operation.tags.every((tag) => typeof tag === 'string'))
  ) {
    throw new Error(`${source}.tags must be an array of strings`);
  }
  if (
    operation.summary !== undefined &&
    typeof operation.summary !== 'string'
  ) {
    throw new Error(`${source}.summary must be a string`);
  }
  if (
    operation.description !== undefined &&
    typeof operation.description !== 'string'
  ) {
    throw new Error(`${source}.description must be a string`);
  }
  return {
    operationId: operation.operationId,
    summary: operation.summary === undefined ? '' : operation.summary,
    description:
      operation.description === undefined ? '' : operation.description,
    tags: operation.tags === undefined ? [] : operation.tags,
  };
}
