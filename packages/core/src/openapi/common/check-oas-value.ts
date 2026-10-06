import type { OasValueSchema } from '../../types/oas-value-validation.js';
import type { SchemaDialect } from '../../types/schema-dialect.js';
import { createOasValueValidator } from './create-oas-value-validator.js';

export function checkOasValue(
  value: unknown,
  schema: OasValueSchema,
  dialect: SchemaDialect,
  source: string,
): void {
  const result = createOasValueValidator(schema, dialect, source).validate(
    value,
  );
  if (!result.valid)
    throw new Error(
      `${source} does not match the OAS schema: ${result.errors.map((error) => error.message).join('; ')}`,
    );
}
