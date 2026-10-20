import { z } from 'zod';
import type { JsonValue } from '../types/api-arguments.js';
import type { OasValueValidator } from '../types/oas-value-validation.js';

/** Runtime validation only; the owning composition supplies its wire metadata. */
export function createOasValueValidationSchema(
  contract: OasValueValidator,
  source: string,
): z.ZodType<JsonValue> {
  const jsonValue = z.json();
  return z.unknown().superRefine((value, context) => {
    if (!jsonValue.safeParse(value).success) {
      context.addIssue({
        code: 'custom',
        message: `${source} must be a JSON value`,
      });
      return;
    }
    for (const error of contract.validate(value).errors)
      context.addIssue({
        code: 'custom',
        message: `${source} does not match the OAS schema: ${error.message}`,
      });
  }) as z.ZodType<JsonValue>;
}
