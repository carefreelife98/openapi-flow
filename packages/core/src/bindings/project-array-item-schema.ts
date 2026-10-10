import type { BindingSchema } from '../types/api-bindings.js';
import type { ArrayItemProjection } from '../types/array-projection.js';
import { isObject } from '../utils/is-object.js';
import type { SchemaResourceContext } from '../types/schema-resource.js';
import {
  intersectBindingSchemas,
  unionBindingSchemas,
} from './combine-binding-schemas.js';

/** Necessary item candidates; the original container remains the validation authority. */
export function projectArrayItemSchema(
  schema: BindingSchema,
  resources?: SchemaResourceContext,
  active = new Set<BindingSchema>(),
): ArrayItemProjection {
  if (typeof schema === 'boolean') return { allowsArray: schema, schema };
  if (resources && typeof schema.$ref === 'string') {
    if (active.has(schema))
      throw new Error(
        'Native array projection has a non-progressing reference cycle',
      );
    active.add(schema);
    const siblings = { ...schema };
    delete siblings.$ref;
    try {
      const target = projectArrayItemSchema(
        resources.resolve(schema),
        resources,
        active,
      );
      const sibling = projectArrayItemSchema(siblings, resources, active);
      const allowsArray = target.allowsArray && sibling.allowsArray;
      return {
        allowsArray,
        schema: allowsArray
          ? intersectBindingSchemas([target.schema, sibling.schema])
          : false,
      };
    } finally {
      active.delete(schema);
    }
  }
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
      if (typeof child === 'boolean' || isObject(child))
        items.push(resources ? resources.reference(child) : child);
  if (schema.items === undefined) items.push(true);
  else if (typeof schema.items === 'boolean' || isObject(schema.items))
    items.push(resources ? resources.reference(schema.items) : schema.items);
  const constraints = [
    schema.maxItems === 0 ? false : unionBindingSchemas(items),
  ];
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (!Array.isArray(schema[key])) continue;
    const branches = schema[key].flatMap((child) =>
      typeof child === 'boolean' || isObject(child)
        ? [projectArrayItemSchema(child, resources, active)]
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
