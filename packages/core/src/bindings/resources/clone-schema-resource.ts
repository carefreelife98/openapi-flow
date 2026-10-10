import type { BindingSchema } from '../../types/api-bindings.js';
import type { SchemaJsonValue } from '../../types/schema-json.js';

/** JSON has locations, not shared JavaScript object identity or object cycles. */
export function cloneSchemaResource(schema: BindingSchema): BindingSchema {
  const active = new Set<object>();
  function copy(value: unknown, path: string): SchemaJsonValue {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    )
      return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || value === null)
      throw new Error(`Native schema${path} must contain JSON values`);
    if (active.has(value))
      throw new Error(
        `Native schema${path} has a JavaScript object cycle; use a schema reference`,
      );
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      throw new Error(`Native schema${path} must contain JSON objects`);
    active.add(value);
    try {
      return Array.isArray(value)
        ? Array.from(value, (child, index) => copy(child, `${path}/${index}`))
        : Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
              key,
              copy(child, `${path}/${key}`),
            ]),
          );
    } finally {
      active.delete(value);
    }
  }
  const result = copy(schema, '');
  if (typeof result === 'boolean') return result;
  if (result === null || typeof result !== 'object' || Array.isArray(result))
    throw new Error('Native schema resource must be a JSON object or boolean');
  return result;
}
