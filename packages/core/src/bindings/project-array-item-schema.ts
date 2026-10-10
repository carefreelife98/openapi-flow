import type { BindingSchema } from '../types/api-bindings.js';
import type { ArrayItemProjection } from '../types/array-projection.js';
import { isObject } from '../utils/is-object.js';
import {
  intersectBindingSchemas,
  unionBindingSchemas,
} from './combine-binding-schemas.js';

/** Necessary item candidates; the original container remains the validation authority. */
export function projectArrayItemSchema(
  schema: BindingSchema,
): ArrayItemProjection {
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
      typeof child === 'boolean' || isObject(child)
        ? [projectArrayItemSchema(child)]
        : [],
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
