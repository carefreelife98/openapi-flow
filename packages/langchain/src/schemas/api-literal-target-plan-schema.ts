import { z } from 'zod';
import type { JsonObject } from '@openapi-flow/core';
import {
  createApiRequestInputPointerSchema,
  optionalPlanningExplanationObjectSchema,
} from '@openapi-flow/core';
import {
  apiLiteralNotProvidedSchema,
  apiLiteralGenerationReasonSchema,
} from './api-literal-generation-output-schema.js';

export function createApiLiteralTargetPlanSchema(
  requestSchema: JsonObject,
  includeExplanations: boolean,
  requireExplanations = true,
) {
  const pointer = createApiRequestInputPointerSchema(requestSchema);
  const base = z.strictObject({
    literalInputs: z.union([
      apiLiteralNotProvidedSchema,
      z.strictObject({
        state: z.literal('provided'),
        targetPointers: z
          .array(pointer)
          .min(1)
          .refine((p) => new Set(p).size === p.length),
      }),
    ]),
    requestedInputs: z
      .array(pointer)
      .refine((p) => new Set(p).size === p.length),
  });
  return includeExplanations
    ? base.extend({
        explanation: requireExplanations
          ? apiLiteralGenerationReasonSchema
          : optionalPlanningExplanationObjectSchema,
      })
    : base;
}
