import type { BindingSchema } from '../types/api-bindings.js';
import { isObject } from '../utils/is-object.js';
import { schemaAllowsContainer } from './schema-allows-container.js';
import {
  intersectBindingSchemas,
  unionBindingSchemas,
} from './combine-binding-schemas.js';

/** Necessary value domain for an unknown object key; full response/key checks remain authoritative. */
export function projectObjectEntryValueSchema(
  schema: BindingSchema,
): BindingSchema {
  if (!schemaAllowsContainer(schema, 'object')) return false;
  if (typeof schema === 'boolean') return schema;
  const values: BindingSchema[] = [];
  for (const keyword of ['properties', 'patternProperties'])
    if (isObject(schema[keyword]))
      for (const child of Object.values(schema[keyword]))
        if (typeof child === 'boolean' || isObject(child)) values.push(child);
  // Unspecified additionalProperties is open by JSON Schema, not a generated data default.
  if (schema.additionalProperties === undefined) values.push(true);
  else if (
    typeof schema.additionalProperties === 'boolean' ||
    isObject(schema.additionalProperties)
  )
    values.push(schema.additionalProperties);
  const constraints = [unionBindingSchemas(values)];
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    if (!Array.isArray(schema[keyword])) continue;
    const alternatives = schema[keyword].map((child) =>
      typeof child === 'boolean' || isObject(child)
        ? projectObjectEntryValueSchema(child)
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
