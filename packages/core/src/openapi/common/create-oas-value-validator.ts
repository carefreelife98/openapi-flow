import { createHash } from 'node:crypto';
import { createValidator } from '@scalar/json-schema-validator';
import type { SchemaDialect } from '../../types/schema-dialect.js';
import type {
  OasValueSchema,
  OasValueValidation,
  OasValueValidator,
} from '../../types/oas-value-validation.js';
import { normalizeOasValueSchema } from './normalize-oas-value-schema.js';
import { isObject } from '../../utils/is-object.js';
import { createOasValueValidationCache } from './create-oas-value-validation-cache.js';

// Internal retention budgets, not limits on accepted OAS contracts or request values.
const compiledValidators = createOasValueValidationCache({
  maximumEntries: 64,
  maximumRetainedSchemaBytes: 1024 * 1024,
});

export function createOasValueValidator(
  input: OasValueSchema,
  dialect: SchemaDialect,
  source: string,
): OasValueValidator {
  if (typeof input !== 'boolean' && !isObject(input))
    throw new Error(`${source} must be an OAS schema object or boolean`);
  if (dialect !== 'openapi-3.0' && dialect !== 'draft-2020-12')
    throw new Error(
      `${source} has an unsupported OAS schema dialect: ${dialect}`,
    );
  const normalized = normalizeOasValueSchema(input, dialect);
  const assertions =
    typeof normalized === 'boolean'
      ? normalized
        ? {}
        : { not: {} }
      : normalized;
  // Each embedded input is a JSON Schema resource: fragment refs stay local to it.
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `urn:openapi-flow:input:${createHash('sha256')
      .update(source)
      .update(JSON.stringify(assertions))
      .digest('hex')}`,
    ...assertions,
  };
  let validate: OasValueValidation;
  try {
    validate = compiledValidators.getOrCreate(schema, dialect, (snapshot) => {
      const compiled = createValidator(snapshot);
      // Scalar parses string documents as YAML; encode actual string values first.
      return (value) =>
        compiled(typeof value === 'string' ? JSON.stringify(value) : value);
    });
  } catch (error) {
    throw new Error(`${source} cannot compile its OAS value schema`, {
      cause: error,
    });
  }
  return {
    schema,
    validate,
  };
}
