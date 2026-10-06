import { z } from 'zod';
import type { JsonValue } from '../types/api-arguments.js';
import type { OasValueSchema } from '../types/oas-value-validation.js';
import type { SchemaDialect } from '../types/schema-dialect.js';
import { createOasValueValidator } from '../openapi/common/create-oas-value-validator.js';

/** Keep OAS assertions intact instead of round-tripping through Zod types. */
export function createOasValueSchema(
  input: OasValueSchema,
  dialect: SchemaDialect,
  source: string,
): z.ZodType<JsonValue> {
  const contract = createOasValueValidator(input, dialect, source);
  const jsonValue = z.json();
  return z
    .unknown()
    .superRefine((value, context) => {
      if (!jsonValue.safeParse(value).success) {
        context.addIssue({
          code: 'custom',
          message: `${source} must be a JSON value`,
        });
        return;
      }
      const result = contract.validate(value);
      for (const error of result.errors)
        context.addIssue({
          code: 'custom',
          message: `${source} does not match the OAS schema: ${error.message}`,
        });
    })
    .meta(contract.schema) as z.ZodType<JsonValue>;
}
