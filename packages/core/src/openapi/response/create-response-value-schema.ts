import type { ApiOperationContract } from '../../types/api-operation.js';
import type { BindingSchema } from '../../types/api-bindings.js';
import { responseBindingSchemas } from '../../bindings/response-binding-schema.js';

/** Candidate schemas for a pointer; validate the selected full response at runtime. */
export function createResponseValueSchema(
  operation: ApiOperationContract,
  pointer: string,
): BindingSchema {
  const schemas = responseBindingSchemas(operation, pointer);
  if (!schemas.length)
    throw new Error(
      `${operation.key.operationRef}${pointer} has no declared response value`,
    );
  return { anyOf: schemas };
}
