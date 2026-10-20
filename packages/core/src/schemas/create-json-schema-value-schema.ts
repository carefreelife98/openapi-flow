import { z } from 'zod';
import { createValidator } from '@scalar/json-schema-validator';
import type { JsonObject } from '../types/openapi.js';
import type { JsonValue } from '../types/api-arguments.js';

/** Keep a JSON Schema's assertions intact; parsing validates without data conversion. */
export function createJsonSchemaValueSchema(
  schema: JsonObject,
  source: string,
): z.ZodType<JsonValue> {
  const validate = createValidator(schema);
  return z.unknown().superRefine((value, context) => {
    if (!z.json().safeParse(value).success) {
      context.addIssue({
        code: 'custom',
        message: `${source} must be a JSON value`,
      });
      return;
    }
    const result = validate(
      typeof value === 'string' ? JSON.stringify(value) : value,
    );
    for (const error of result.errors)
      context.addIssue({
        code: 'custom',
        message: `${source} does not match its JSON Schema: ${error.message}`,
      });
  }) as z.ZodType<JsonValue>;
}
