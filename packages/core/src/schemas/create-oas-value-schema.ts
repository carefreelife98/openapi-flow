import type { z } from 'zod';
import type { JsonValue } from '../types/api-arguments.js';
import type { OasValueSchema } from '../types/oas-value-validation.js';
import type { SchemaDialect } from '../types/schema-dialect.js';
import { createOasValueValidator } from '../openapi/common/create-oas-value-validator.js';
import { createOasValueValidationSchema } from './create-oas-value-validation-schema.js';

/** Keep OAS assertions intact instead of round-tripping through Zod types. */
export function createOasValueSchema(
  input: OasValueSchema,
  dialect: SchemaDialect,
  source: string,
): z.ZodType<JsonValue> {
  const contract = createOasValueValidator(input, dialect, source);
  return createOasValueValidationSchema(contract, source).meta(contract.schema);
}
