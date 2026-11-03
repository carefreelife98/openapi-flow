import uri from 'fast-uri';
import type { BindingSchema } from '../../types/api-bindings.js';
import type { SchemaResourceRegistration } from '../../types/schema-resource.js';
import { isObject } from '../../utils/is-object.js';
import { jsonValuesEqual } from '../../utils/json-values-equal.js';

/** Index declared resource IDs in every schema-valued keyword, including modern tuple positions. */
export function listSchemaResources(
  root: BindingSchema,
): SchemaResourceRegistration[] {
  const found = new Map<string, SchemaResourceRegistration>();
  const active = new Set<object>();
  function visit(schema: BindingSchema, base: string, path: string): void {
    if (typeof schema === 'boolean') return;
    if (active.has(schema))
      throw new Error(
        `Schema${path} has an object cycle; declare a schema reference`,
      );
    if (schema.$id !== undefined && typeof schema.$id !== 'string')
      throw new Error(`Schema${path}.$id must be a URI-reference string`);
    const current =
      typeof schema.$id === 'string' ? uri.resolve(base, schema.$id) : base;
    if (typeof schema.$id === 'string' && current !== '') {
      const previous = found.get(current);
      if (previous && !jsonValuesEqual(previous.schema, schema))
        throw new Error(
          `Schema${path} declares conflicting resource ID ${current}`,
        );
      if (!previous) found.set(current, { uri: current, schema });
    }
    active.add(schema);
    try {
      function child(value: unknown, suffix: string): void {
        if (typeof value === 'boolean' || isObject(value))
          visit(value, current, path + suffix);
      }
      for (const key of [
        '$defs',
        'definitions',
        'properties',
        'patternProperties',
        'dependentSchemas',
        'dependencies',
      ])
        if (isObject(schema[key]))
          for (const [name, value] of Object.entries(schema[key]))
            child(
              value,
              '/' +
                key +
                '/' +
                name.replaceAll('~', '~0').replaceAll('/', '~1'),
            );
      for (const key of [
        'items',
        'contains',
        'additionalProperties',
        'additionalItems',
        'unevaluatedProperties',
        'unevaluatedItems',
        'propertyNames',
        'not',
        'if',
        'then',
        'else',
      ]) {
        if (Array.isArray(schema[key]))
          schema[key].forEach((value, index) =>
            child(value, '/' + key + '/' + index),
          );
        else child(schema[key], '/' + key);
      }
      for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems'])
        if (Array.isArray(schema[key]))
          schema[key].forEach((value, index) =>
            child(value, '/' + key + '/' + index),
          );
    } finally {
      active.delete(schema);
    }
  }
  visit(root, '', '');
  return [...found.values()];
}
