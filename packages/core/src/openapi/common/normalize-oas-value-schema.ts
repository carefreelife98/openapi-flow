import type { OasValueSchema } from '../../types/oas-value-validation.js';
import type { SchemaDialect } from '../../types/schema-dialect.js';
import { isObject } from '../../utils/is-object.js';

/** Convert only OAS 3.0 assertion syntax, not formats, annotations or data. */
export function normalizeOasValueSchema(
  input: OasValueSchema,
  dialect: SchemaDialect,
): OasValueSchema {
  const owned = structuredClone(input);
  if (dialect === 'draft-2020-12' || typeof owned === 'boolean') return owned;
  const normalized = new WeakMap<object, OasValueSchema>();
  const active = new WeakSet<object>();
  function normalize(value: OasValueSchema): OasValueSchema {
    if (typeof value === 'boolean') return value;
    if (active.has(value))
      throw new Error(
        'OAS schema contains a cyclic in-memory schema; use a declared $ref',
      );
    const previous = normalized.get(value);
    if (previous !== undefined) return previous;
    // Copy schema containers shallowly. Annotation/data aliases must keep their original values.
    const schema = { ...value };
    normalized.set(value, schema);
    active.add(value);
    try {
      if (schema.nullable === true && typeof schema.type === 'string')
        schema.type = [schema.type, 'null'];
      delete schema.nullable;
      for (const bound of ['Minimum', 'Maximum']) {
        const exclusive = `exclusive${bound}`;
        const inclusive = bound.toLowerCase();
        if (typeof schema[exclusive] !== 'boolean') continue;
        if (
          schema[exclusive] === true &&
          typeof schema[inclusive] === 'number'
        ) {
          schema[exclusive] = schema[inclusive];
          delete schema[inclusive];
        } else delete schema[exclusive];
      }
      for (const key of [
        'properties',
        'patternProperties',
        '$defs',
        'definitions',
      ]) {
        if (!isObject(schema[key])) continue;
        schema[key] = Object.fromEntries(
          Object.entries(schema[key]).map(([name, child]) => [
            name,
            isObject(child) || typeof child === 'boolean'
              ? normalize(child)
              : child,
          ]),
        );
      }
      for (const key of ['items', 'additionalProperties', 'not']) {
        const child = schema[key];
        if (isObject(child) || typeof child === 'boolean')
          schema[key] = normalize(child);
      }
      for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
        if (!Array.isArray(schema[key])) continue;
        schema[key] = schema[key].map((child) =>
          isObject(child) || typeof child === 'boolean'
            ? normalize(child)
            : child,
        );
      }

      return schema;
    } finally {
      active.delete(value);
    }
  }
  return normalize(owned);
}
