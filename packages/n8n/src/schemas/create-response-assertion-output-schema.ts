import type { BindingSchema, JsonValueObject } from '@openapi-flow/core';
import { assertionParametersSchema } from './native-capability-schemas.js';

/** The assertion runtime emits exactly this success object; failed checks throw. */
export function createResponseAssertionOutputSchema(
  value: JsonValueObject,
): BindingSchema {
  const parameters = assertionParametersSchema.parse(value);
  return {
    type: 'object',
    properties: {
      pass: { type: 'boolean', const: true },
      assertionCount: { type: 'integer', const: parameters.checks.length },
    },
    required: ['pass', 'assertionCount'],
    additionalProperties: false,
  };
}
