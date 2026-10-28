import type { BindingSchema } from '../types/api-bindings.js';
import { isObject } from '../utils/is-object.js';
import { schemaAllowsContainer } from './schema-allows-container.js';
import {
  intersectBindingSchemas,
  unionBindingSchemas,
} from './combine-binding-schemas.js';
import type { SchemaResourceContext } from '../types/schema-resource.js';

/** Necessary value domain for an unknown object key; full response/key checks remain authoritative. */
export function projectObjectEntryValueSchema(
  schema: BindingSchema,
  resources?: SchemaResourceContext,
  active = new Set<BindingSchema>(),
): BindingSchema {
  if (
    resources &&
    typeof schema !== 'boolean' &&
    typeof schema.$ref === 'string'
  ) {
    if (active.has(schema))
      throw new Error(
        'Object entry projection has a non-progressing reference cycle',
      );
    active.add(schema);
    const siblings = { ...schema };
    delete siblings.$ref;
    try {
      return intersectBindingSchemas([
        projectObjectEntryValueSchema(
          resources.resolve(schema),
          resources,
          active,
        ),
        projectObjectEntryValueSchema(siblings, resources, active),
      ]);
    } finally {
      active.delete(schema);
    }
  }
  if (!schemaAllowsContainer(schema, 'object')) return false;
  if (typeof schema === 'boolean') return schema;
  const values: BindingSchema[] = [];
  for (const keyword of ['properties', 'patternProperties'])
    if (isObject(schema[keyword]))
      for (const child of Object.values(schema[keyword]))
        if (typeof child === 'boolean' || isObject(child))
          values.push(resources ? resources.reference(child) : child);
  // Unspecified additionalProperties is open by JSON Schema, not a generated data default.
  if (schema.additionalProperties === undefined) values.push(true);
  else if (
    typeof schema.additionalProperties === 'boolean' ||
    isObject(schema.additionalProperties)
  )
    values.push(
      resources
        ? resources.reference(schema.additionalProperties)
        : schema.additionalProperties,
    );
  const constraints = [unionBindingSchemas(values)];
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    if (!Array.isArray(schema[keyword])) continue;
    const alternatives = schema[keyword].map((child) =>
      typeof child === 'boolean' || isObject(child)
        ? projectObjectEntryValueSchema(child, resources, active)
        : false,
    );
    constraints.push(
      keyword === 'allOf'
        ? intersectBindingSchemas(alternatives)
        : unionBindingSchemas(alternatives),
    );
  }
  return intersectBindingSchemas(constraints);
}
