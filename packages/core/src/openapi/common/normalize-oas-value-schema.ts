import type { OasValueSchema } from '../../types/oas-value-validation.js';
import type { SchemaDialect } from '../../types/schema-dialect.js';
import { isObject } from '../../utils/is-object.js';

/** Convert only OAS 3.0 assertion syntax, not formats, annotations or data. */
export function normalizeOasValueSchema(
  input: OasValueSchema,
  dialect: SchemaDialect,
): OasValueSchema {
  if (dialect === 'draft-2020-12' || typeof input === 'boolean')
    return structuredClone(input);
  const schema = structuredClone(input);
  if (schema.nullable === true && typeof schema.type === 'string')
    schema.type = [schema.type, 'null'];
  delete schema.nullable;
  for (const bound of ['Minimum', 'Maximum']) {
    const exclusive = `exclusive${bound}`;
    const inclusive = bound.toLowerCase();
    if (typeof schema[exclusive] !== 'boolean') continue;
    if (schema[exclusive] === true && typeof schema[inclusive] === 'number') {
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
          ? normalizeOasValueSchema(child, dialect)
          : child,
      ]),
    );
  }
  for (const key of ['items', 'additionalProperties', 'not']) {
    const child = schema[key];
    if (isObject(child) || typeof child === 'boolean')
      schema[key] = normalizeOasValueSchema(child, dialect);
  }
  for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
    if (!Array.isArray(schema[key])) continue;
    schema[key] = schema[key].map((child) =>
      isObject(child) || typeof child === 'boolean'
        ? normalizeOasValueSchema(child, dialect)
        : child,
    );
  }
  return schema;
}
