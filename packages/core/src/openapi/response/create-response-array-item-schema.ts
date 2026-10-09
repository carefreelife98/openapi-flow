import type { ApiOperationContract } from '../../types/api-operation.js';
import type { BindingSchema } from '../../types/api-bindings.js';
import { responseBindingSchemas } from '../../bindings/response-binding-schema.js';
import { isObject } from '../../utils/is-object.js';

function itemSchemas(schema: BindingSchema): BindingSchema[] {
  if (typeof schema === 'boolean') return [];
  const branches = ['anyOf', 'oneOf', 'allOf'].flatMap((key) =>
    Array.isArray(schema[key])
      ? schema[key].flatMap((child) =>
          isObject(child) ? itemSchemas(child) : [],
        )
      : [],
  );
  if (
    schema.type === 'array' ||
    (Array.isArray(schema.type) && schema.type.includes('array'))
  ) {
    if (Array.isArray(schema.prefixItems))
      for (const child of schema.prefixItems)
        if (typeof child === 'boolean' || isObject(child)) branches.push(child);
    if (schema.items === undefined) branches.push(true);
    else if (typeof schema.items === 'boolean' || isObject(schema.items))
      branches.push(schema.items);
  }
  return branches;
}

/** Item candidates come from OAS; the original full response is validated at runtime. */
export function createResponseArrayItemSchema(
  operation: ApiOperationContract,
  pointer: string,
): BindingSchema {
  const items = responseBindingSchemas(operation, pointer).flatMap(itemSchemas);
  if (!items.length)
    throw new Error(
      `${operation.key.operationRef}${pointer} has no declared response array`,
    );
  return { anyOf: items };
}
