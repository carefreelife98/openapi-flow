import type { JsonObject, ScalarSchema } from '../types/openapi.js';
import type { Primitive } from '../types/workflow.js';

export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function looksLikeCredential(name: string): boolean {
  return /(token|secret|password|authorization|api.?key)/i.test(name);
}

export function checkPrimitive(
  value: unknown,
  schema: ScalarSchema,
  source: string,
): asserts value is Primitive {
  if (
    schema.type === 'integer'
      ? !Number.isSafeInteger(value)
      : schema.type === 'number'
        ? typeof value !== 'number' || !Number.isFinite(value)
        : typeof value !== schema.type
  ) {
    throw new Error(source + ' must be ' + schema.type);
  }
  if (schema.enum && !schema.enum.includes(value as Primitive))
    throw new Error(source + ' is outside the OAS enum');
}

export function originFrom(baseUrl: string): URL {
  if (typeof baseUrl !== 'string' || !URL.canParse(baseUrl)) {
    throw new Error('baseUrl must be an absolute HTTP(S) origin');
  }
  const url = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'baseUrl must be an HTTP(S) origin without credentials, path, query, or fragment',
    );
  }
  return url;
}

export function checkPlanSize(plan: unknown): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(plan);
  } catch {
    throw new Error('plan must be JSON-serializable');
  }
  if (!serialized || Buffer.byteLength(serialized) > 100_000) {
    throw new Error('plan must be a JSON document under 100 KB');
  }
}
