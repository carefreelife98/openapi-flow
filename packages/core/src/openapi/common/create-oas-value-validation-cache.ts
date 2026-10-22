import { Buffer } from 'node:buffer';
import { isDeepStrictEqual } from 'node:util';
import type {
  OasValueValidationCache,
  OasValueValidationCacheEntry,
  OasValueValidationCacheOptions,
} from '../../types/oas-value-validation.js';

/** Cache compilation only; every supplied value still runs the original validator. */
export function createOasValueValidationCache(
  options: OasValueValidationCacheOptions,
): OasValueValidationCache {
  for (const name of ['maximumEntries', 'maximumRetainedSchemaBytes'] as const)
    if (!Number.isSafeInteger(options[name]) || options[name] <= 0)
      throw new Error(
        `OAS validator cache.${name} must be a positive safe integer`,
      );
  const { maximumEntries, maximumRetainedSchemaBytes } = options;
  const entries = new Map<string, OasValueValidationCacheEntry>();
  let retainedSchemaBytes = 0;
  return {
    getOrCreate: (schema, dialect, compile) => {
      const key = JSON.stringify([dialect, schema]);
      const existing = entries.get(key);
      // Serialization alone is not identity: undefined and non-JSON values can collide.
      if (
        existing !== undefined &&
        isDeepStrictEqual(existing.schema, schema)
      ) {
        entries.delete(key);
        entries.set(key, existing);
        return existing.validate;
      }
      // Neither returned schemas nor caller-owned objects can mutate the compiled resource.
      const snapshot = structuredClone(schema);
      const validate = compile(snapshot);
      const bytes = Buffer.byteLength(key);
      // Large schemas remain supported; only their optional retention is bounded.
      if (bytes > maximumRetainedSchemaBytes) return validate;
      if (existing !== undefined) {
        entries.delete(key);
        retainedSchemaBytes -= existing.bytes;
      }
      while (
        entries.size >= maximumEntries ||
        retainedSchemaBytes + bytes > maximumRetainedSchemaBytes
      ) {
        const oldest = entries.entries().next();
        if (oldest.done)
          throw new Error(
            'OAS validator cache retained-size invariant is invalid',
          );
        entries.delete(oldest.value[0]);
        retainedSchemaBytes -= oldest.value[1].bytes;
      }
      entries.set(key, { schema: snapshot, validate, bytes });
      retainedSchemaBytes += bytes;
      return validate;
    },
  };
}
