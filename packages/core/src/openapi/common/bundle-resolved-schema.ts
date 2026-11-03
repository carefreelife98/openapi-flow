import { createHash } from 'node:crypto';
import type { BindingSchema } from '../../types/api-bindings.js';
import type { JsonObject } from '../../types/openapi.js';
import { isObject } from '../../utils/is-object.js';

/** Resolved schemas are runtime graphs. Export finite schema resources, never object cycles. */
export function bundleResolvedSchema(
  input: BindingSchema,
  source: string,
): BindingSchema {
  const active = new Map<JsonObject, string>();
  const copies = new WeakMap<JsonObject, JsonObject>();
  const definitions: Record<string, BindingSchema> = Object.create(null);
  const references: JsonObject[] = [];
  function visit(schema: BindingSchema, pointer: string): BindingSchema {
    if (typeof schema === 'boolean') return schema;
    const ancestor = active.get(schema);
    if (ancestor !== undefined) {
      const reference =
        ancestor === ''
          ? '#'
          : '#/$defs/oas-' +
            createHash('sha256').update(ancestor).digest('hex');
      if (ancestor !== '') {
        const target = copies.get(schema);
        if (!target)
          throw new Error(
            `${source}${pointer}: missing schema resource target`,
          );
        definitions[reference.slice('#/$defs/'.length)] = target;
      }
      const result = { $ref: reference };
      references.push(result);
      return result;
    }
    if (schema.$ref !== undefined)
      throw new Error(
        `${source}${pointer}: unresolved schema reference ${String(schema.$ref)}`,
      );
    const result: JsonObject = { ...schema };
    copies.set(schema, result);
    active.set(schema, pointer);
    function child(value: unknown, suffix: string): unknown {
      return typeof value === 'boolean' || isObject(value)
        ? visit(value, pointer + suffix)
        : structuredClone(value);
    }
    try {
      for (const key of [
        '$defs',
        'definitions',
        'properties',
        'patternProperties',
        'dependentSchemas',
        'dependencies',
      ]) {
        if (!isObject(schema[key])) continue;
        result[key] = Object.fromEntries(
          Object.entries(schema[key]).map(([name, value]) => [
            name,
            child(
              value,
              '/' +
                key +
                '/' +
                name.replaceAll('~', '~0').replaceAll('/', '~1'),
            ),
          ]),
        );
      }
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
          result[key] = schema[key].map((value, index) =>
            child(value, '/' + key + '/' + index),
          );
        else if (typeof schema[key] === 'boolean' || isObject(schema[key]))
          result[key] = child(schema[key], '/' + key);
      }
      for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems'])
        if (Array.isArray(schema[key]))
          result[key] = schema[key].map((value, index) =>
            child(value, '/' + key + '/' + index),
          );
      return result;
    } finally {
      active.delete(schema);
    }
  }
  const root = visit(input, '');
  if (typeof root === 'boolean' || !references.length) return root;
  const resourceId =
    'urn:openapi-flow:oas-schema:' +
    createHash('sha256')
      .update(JSON.stringify({ root, definitions }))
      .digest('hex');
  // Static references have already been resolved. Relocate their identities as one closed resource.
  // Dynamic references depend on lexical scope and must never be silently rebased.
  const visited = new Set<object>();
  function relocate(value: unknown): void {
    if (value === null || typeof value !== 'object' || visited.has(value))
      return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(relocate);
      return;
    }
    const schema = value as JsonObject;
    if (
      schema.$dynamicRef !== undefined ||
      schema.$dynamicAnchor !== undefined ||
      schema.$recursiveRef !== undefined ||
      schema.$recursiveAnchor !== undefined
    )
      throw new Error(
        `${source}: recursive static bundle cannot relocate dynamic schema scope`,
      );
    delete schema.$id;
    delete schema.$anchor;
    for (const key of [
      '$defs',
      'definitions',
      'properties',
      'patternProperties',
      'dependentSchemas',
      'dependencies',
    ])
      if (isObject(schema[key])) Object.values(schema[key]).forEach(relocate);
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
      'allOf',
      'anyOf',
      'oneOf',
      'prefixItems',
    ])
      relocate(schema[key]);
  }
  relocate(root);
  Object.values(definitions).forEach(relocate);
  const declared = isObject(root.$defs) ? root.$defs : {};
  for (const name of Object.keys(definitions))
    if (Object.hasOwn(declared, name))
      throw new Error(
        `${source}: generated schema definition conflicts with ${name}`,
      );
  root.$defs = { ...declared, ...definitions };
  root.$id = resourceId;
  for (const reference of references)
    reference.$ref = resourceId + reference.$ref;
  return root;
}
