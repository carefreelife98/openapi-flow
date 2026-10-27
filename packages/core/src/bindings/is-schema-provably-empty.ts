import type { BindingSchema } from '../types/api-bindings.js';
import { isObject } from '../utils/is-object.js';
import { possibleSchemaValueTypes } from './possible-schema-value-types.js';

/** A conservative emptiness proof, not a general JSON Schema satisfiability decision. */
export function isSchemaProvablyEmpty(schema: BindingSchema): boolean {
  if (typeof schema === 'boolean') return !schema;
  if (!isObject(schema))
    throw new Error(
      'Empty-domain inspection.schema must be a boolean or JSON Schema object',
    );
  if (!possibleSchemaValueTypes(schema).size) return true;
  if (
    schema.not === true ||
    (isObject(schema.not) && Object.keys(schema.not).length === 0)
  )
    return true;
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    const alternatives = schema[keyword];
    if (!Array.isArray(alternatives)) continue;
    const empty = alternatives.map(
      (child) =>
        (typeof child === 'boolean' || isObject(child)) &&
        isSchemaProvablyEmpty(child),
    );
    if (keyword === 'allOf' ? empty.some(Boolean) : empty.every(Boolean))
      return true;
  }
  if (
    schema.type === 'object' &&
    Array.isArray(schema.required) &&
    isObject(schema.properties)
  ) {
    const properties = schema.properties;
    if (
      schema.required.some((name) => {
        const child = properties[name];
        return (
          (typeof child === 'boolean' || isObject(child)) &&
          isSchemaProvablyEmpty(child)
        );
      })
    )
      return true;
  }
  if (schema.type === 'array' && typeof schema.minItems === 'number') {
    if (
      typeof schema.maxItems === 'number' &&
      schema.maxItems < schema.minItems
    )
      return true;
    const prefix = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
    for (const child of prefix.slice(0, schema.minItems))
      if (
        (typeof child === 'boolean' || isObject(child)) &&
        isSchemaProvablyEmpty(child)
      )
        return true;
    const items = schema.items;
    if (
      schema.minItems > prefix.length &&
      (typeof items === 'boolean' || isObject(items)) &&
      isSchemaProvablyEmpty(items)
    )
      return true;
  }
  return false;
}
