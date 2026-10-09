import type { ApiOperationContract } from '../../types/api-operation.js';
import type { BindingSchema } from '../../types/api-bindings.js';
import { responseBindingSchemas } from '../../bindings/response-binding-schema.js';
import { isObject } from '../../utils/is-object.js';
import type { ResponseArrayItemProjection } from '../../types/response-projection.js';
import {
  intersectBindingSchemas,
  unionBindingSchemas,
} from '../../bindings/combine-binding-schemas.js';

function itemSchemas(schema: BindingSchema): ResponseArrayItemProjection {
  if (typeof schema === 'boolean') return { allowsArray: schema, schema };
  const types =
    schema.type === undefined
      ? undefined
      : Array.isArray(schema.type)
        ? schema.type
        : [schema.type];
  let allowsArray = !types || types.includes('array');
  const items: BindingSchema[] = [];
  if (Array.isArray(schema.prefixItems))
    for (const child of schema.prefixItems)
      if (typeof child === 'boolean' || isObject(child)) items.push(child);
  if (schema.items === undefined) items.push(true);
  else if (typeof schema.items === 'boolean' || isObject(schema.items))
    items.push(schema.items);
  const constraints = [
    schema.maxItems === 0 ? false : unionBindingSchemas(items),
  ];
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (!Array.isArray(schema[key])) continue;
    const branches = schema[key].flatMap((child) =>
      typeof child === 'boolean' || isObject(child) ? [itemSchemas(child)] : [],
    );
    if (key === 'allOf') {
      allowsArray &&= branches.every((branch) => branch.allowsArray);
      constraints.push(
        intersectBindingSchemas(branches.map((branch) => branch.schema)),
      );
    } else {
      allowsArray &&= branches.some((branch) => branch.allowsArray);
      constraints.push(
        unionBindingSchemas(
          branches
            .filter((branch) => branch.allowsArray)
            .map((branch) => branch.schema),
        ),
      );
    }
  }
  return {
    allowsArray,
    schema: allowsArray ? intersectBindingSchemas(constraints) : false,
  };
}

/** Item candidates come from OAS; the original full response is validated at runtime. */
export function createResponseArrayItemSchema(
  operation: ApiOperationContract,
  pointer: string,
): BindingSchema {
  const items = responseBindingSchemas(operation, pointer).flatMap((schema) => {
    const projection = itemSchemas(schema);
    return projection.allowsArray ? [projection.schema] : [];
  });
  if (!items.length)
    throw new Error(
      `${operation.key.operationRef}${pointer} has no declared response array`,
    );
  return { anyOf: items };
}
