import type { ApiOperationContract } from '../../types/api-operation.js';
import type { BindingSchema } from '../../types/api-bindings.js';
import { createResponseArrayItemSchema } from './create-response-array-item-schema.js';
import { projectSchemaPointer } from '../../bindings/project-schema-pointer.js';

/** Project a value relative to each possible array item, never a hypothetical first response item. */
export function createResponseArrayItemValueSchema(
  operation: ApiOperationContract,
  arrayPointer: string,
  itemPointer: string,
): BindingSchema {
  const schemas = projectSchemaPointer(
    createResponseArrayItemSchema(operation, arrayPointer),
    itemPointer,
  );
  if (!schemas.length)
    throw new Error(
      `${operation.key.operationRef}${arrayPointer}: no declared item value at ${itemPointer}`,
    );
  return { anyOf: schemas };
}
