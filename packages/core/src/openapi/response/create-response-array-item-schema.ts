import type { ApiOperationContract } from '../../types/api-operation.js';
import type { BindingSchema } from '../../types/api-bindings.js';
import { responseBindingSchemas } from '../../bindings/response-binding-schema.js';
import { schemaReferenceContext } from '../../bindings/resources/schema-reference-context.js';
import { projectArrayItemSchema } from '../../bindings/project-array-item-schema.js';

/** Item candidates come from OAS; the original full response is validated at runtime. */
export function createResponseArrayItemSchema(
  operation: ApiOperationContract,
  pointer: string,
): BindingSchema {
  const items = responseBindingSchemas(operation, pointer).flatMap((schema) => {
    const resources = schemaReferenceContext(schema);
    const projection = projectArrayItemSchema(
      resources ? resources.root : schema,
      resources,
    );
    return projection.allowsArray
      ? [resources ? resources.bundle(projection.schema) : projection.schema]
      : [];
  });
  if (!items.length)
    throw new Error(
      `${operation.key.operationRef}${pointer} has no declared response array`,
    );
  return { anyOf: items };
}
