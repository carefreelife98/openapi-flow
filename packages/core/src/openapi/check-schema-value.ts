import { validate } from '@scalar/json-schema-validator';
import type { JsonObject } from '../types/openapi.js';

export function checkSchemaValue(
  value: unknown,
  schema: JsonObject,
  source: string,
): void {
  // Wrapping also keeps a literal string such as "null" from being parsed as YAML.
  const result = validate([value], { type: 'array', items: schema });
  if (!result.valid) {
    throw new Error(
      `${source} does not match the OAS schema: ${result.errors.map((error) => error.message).join('; ')}`,
    );
  }
}
