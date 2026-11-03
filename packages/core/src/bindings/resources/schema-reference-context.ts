import type { BindingSchema } from '../../types/api-bindings.js';
import type { SchemaResourceContext } from '../../types/schema-resource.js';
import { isObject } from '../../utils/is-object.js';
import { createSchemaResourceContext } from './create-schema-resource-context.js';

/** Inline schemas need no relocation. Referenced resources must retain their lexical scope. */
export function schemaReferenceContext(
  schema: BindingSchema,
): SchemaResourceContext | undefined {
  function referenced(current: BindingSchema): boolean {
    if (typeof current === 'boolean') return false;
    if (
      [
        '$id',
        '$ref',
        '$anchor',
        '$dynamicRef',
        '$dynamicAnchor',
        '$recursiveRef',
        '$recursiveAnchor',
      ].some((key) => current[key] !== undefined)
    )
      return true;
    for (const key of [
      '$defs',
      'definitions',
      'properties',
      'patternProperties',
      'dependentSchemas',
      'dependencies',
    ])
      if (
        isObject(current[key]) &&
        Object.values(current[key]).some(
          (value) =>
            (typeof value === 'boolean' || isObject(value)) &&
            referenced(value),
        )
      )
        return true;
    for (const key of [
      'items',
      'additionalProperties',
      'contains',
      'additionalItems',
      'unevaluatedProperties',
      'unevaluatedItems',
      'propertyNames',
      'not',
      'if',
      'then',
      'else',
      'allOf',
      'anyOf',
      'oneOf',
      'prefixItems',
    ]) {
      const child = current[key];
      if (
        Array.isArray(child)
          ? child.some(
              (value) =>
                (typeof value === 'boolean' || isObject(value)) &&
                referenced(value),
            )
          : (typeof child === 'boolean' || isObject(child)) && referenced(child)
      )
        return true;
    }
    return false;
  }
  return referenced(schema) ? createSchemaResourceContext(schema) : undefined;
}
