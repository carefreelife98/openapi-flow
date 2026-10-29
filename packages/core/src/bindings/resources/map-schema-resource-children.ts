import type { JsonObject } from '../../types/openapi.js';
import type { SchemaResourceMapper } from '../../types/schema-resource.js';
import { isObject } from '../../utils/is-object.js';

/** Traverse JSON Schema positions only; const, enum, examples and defaults are data. */
export function mapSchemaResourceChildren(
  schema: JsonObject,
  map: SchemaResourceMapper,
): JsonObject {
  const result = { ...schema };
  for (const keyword of [
    '$defs',
    'definitions',
    'properties',
    'patternProperties',
    'dependentSchemas',
    'dependencies',
  ]) {
    const children = schema[keyword];
    if (!isObject(children)) continue;
    result[keyword] = Object.fromEntries(
      Object.entries(children).map(([name, child]) => [
        name,
        typeof child === 'boolean' || isObject(child) ? map(child) : child,
      ]),
    );
  }
  for (const keyword of [
    'items',
    'contains',
    'additionalProperties',
    'unevaluatedProperties',
    'unevaluatedItems',
    'propertyNames',
    'not',
    'if',
    'then',
    'else',
  ]) {
    const child = schema[keyword];
    if (typeof child === 'boolean' || isObject(child))
      result[keyword] = map(child);
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
    const children = schema[keyword];
    if (Array.isArray(children))
      result[keyword] = children.map((child) =>
        typeof child === 'boolean' || isObject(child) ? map(child) : child,
      );
  }
  return result;
}
