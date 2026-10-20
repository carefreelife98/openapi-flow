import { z } from 'zod';
import type { ApiArgumentGenerationContract } from '@openapi-flow/core';
import type { ApiLiteralGenerationOutputSchema } from '../types/argument-generation.js';

export const apiLiteralGenerationOptionsSchema = z.strictObject({
  includeExplanations: z.boolean().optional(),
});

export const apiLiteralGenerationReasonSchema = z.strictObject({
  reason: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0)
    .describe(
      'Brief user-facing reason in the scenario language for these proposed literals or their deliberate omission. It applies only to values in this proposal, not confirmed inputs or preceding-node bindings. Code attaches the original scenario, optional call role and the actual projected literal input contract. Do not generate evidence, source quotes, OAS schemas, metadata, missing-input reports or private chain-of-thought.',
    ),
});

/** The core values schema is unchanged; only optional human-readable attribution is added. */
export function createApiLiteralGenerationOutputSchema(
  contract: ApiArgumentGenerationContract,
  includeExplanations: boolean,
): ApiLiteralGenerationOutputSchema {
  z.boolean().parse(includeExplanations);
  return includeExplanations && contract.hasLiteralInputs
    ? contract.schema.extend({
        explanation: apiLiteralGenerationReasonSchema,
      })
    : contract.schema;
}
