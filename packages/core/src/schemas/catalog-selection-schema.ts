import { z } from 'zod';

export function createCatalogSelectionSchema(candidateIds: string[]) {
  if (candidateIds.length === 0)
    throw new Error('catalog has no path operations to select');
  return z
    .object({
      steps: z
        .array(
          z
            .object({
              candidateId: z
                .enum(candidateIds)
                .describe(
                  'Exact candidateId from the supplied operation catalog.',
                ),
              purpose: z
                .string()
                .min(1)
                .describe('The scenario subgoal served by this API call.'),
            })
            .strict(),
        )
        .describe('Ordered API calls needed to perform the scenario.'),
      gaps: z
        .array(
          z
            .object({
              kind: z
                .enum(['missing_operation', 'insufficient_contract'])
                .describe(
                  'Use missing_operation when no candidate covers a required capability; use insufficient_contract when a specific candidate lacks a required request or response field.',
                ),
              description: z
                .string()
                .min(1)
                .describe(
                  'A scenario requirement not fulfilled by any catalog operation; this is a proposal requiring human review.',
                ),
              candidateId: z
                .enum(candidateIds)
                .describe(
                  'The specific candidate with an insufficient contract; omit for a missing operation.',
                )
                .optional(),
            })
            .strict(),
        )
        .describe(
          'Requirements for which the available OAS operations appear insufficient. Empty when all requirements are covered.',
        ),
    })
    .strict();
}
