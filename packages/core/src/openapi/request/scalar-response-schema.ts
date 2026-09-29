import type { Scalar, ScalarSchema } from '../../types/openapi.js';
import { dereferencedObject } from '../common/parse-spec-utils.js';
import { UnsupportedOperationError } from '../common/unsupported-operation-error.js';

export function scalarResponseSchema(
  value: unknown,
  source: string,
  operationRef: string,
): ScalarSchema {
  const schema = dereferencedObject(value, source);
  if (
    !['string', 'integer', 'number', 'boolean'].includes(String(schema.type))
  ) {
    throw new UnsupportedOperationError(
      operationRef,
      `${source} must be a primitive schema`,
    );
  }
  if (
    schema.enum !== undefined &&
    (!Array.isArray(schema.enum) ||
      schema.enum.length === 0 ||
      schema.enum.some(
        (entry) =>
          typeof entry !== 'string' &&
          typeof entry !== 'number' &&
          typeof entry !== 'boolean',
      ))
  ) {
    throw new UnsupportedOperationError(
      operationRef,
      `${source}.enum must contain primitive values`,
    );
  }
  return {
    type: schema.type as string,
    enum: schema.enum as Scalar[] | undefined,
  };
}
