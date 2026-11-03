import type { JsonObject } from '../../types/openapi.js';
import { isObject } from '../../utils/is-object.js';
import { bundleResolvedSchema } from './bundle-resolved-schema.js';

/** Schema recursion belongs to schema resources; structural OpenAPI objects remain JSON. */
export function bundleResolvedOpenApiDocument(input: JsonObject): JsonObject {
  const active = new Set<object>();
  function copy(value: unknown, path: string[]): unknown {
    if (value === null || typeof value !== 'object') return value;
    const schemaRoot =
      (path.at(-1) === 'schema' &&
        ['content', 'parameters', 'headers'].includes(String(path.at(-3)))) ||
      (path.length === 3 && path[0] === 'components' && path[1] === 'schemas');
    if (schemaRoot && (typeof value === 'boolean' || isObject(value)))
      return bundleResolvedSchema(value, 'spec/' + path.join('/'));
    if (active.has(value))
      throw new Error(`spec/${path.join('/')}: non-schema reference cycle`);
    active.add(value);
    try {
      if (Array.isArray(value))
        return value.map((child, index) =>
          copy(child, [...path, String(index)]),
        );
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          ['example', 'examples', 'default', 'enum', 'const'].includes(key) ||
          key.startsWith('x-')
            ? structuredClone(child)
            : copy(child, [...path, key]),
        ]),
      );
    } finally {
      active.delete(value);
    }
  }
  return copy(input, []) as JsonObject;
}
