import type { JsonValue } from '../types/api-arguments.js';

/** JSON-only structural copy; object keys cannot invoke prototype setters. */
export function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (value === null || typeof value !== 'object') return value;
  const result: Record<string, JsonValue> = Object.create(null);
  for (const [key, child] of Object.entries(value))
    result[key] = cloneJsonValue(child);
  return result;
}
