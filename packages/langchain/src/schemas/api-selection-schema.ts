import { z } from 'zod';

export function createApiSelectionSchema(candidateIds: string[]) {
  if (candidateIds.length === 0)
    throw new Error('operations must contain candidates for model selection');
  return z
    .object({
      operations: z.array(
        z
          .object({
            candidateId: z
              .enum(candidateIds)
              .describe(
                'Exact identifier from supplied candidates; do not invent an API.',
              ),
            purpose: z
              .string()
              .min(1)
              .describe(
                'Why this API is needed for the user scenario. This is not an execution order.',
              ),
          })
          .strict(),
      ),
      gaps: z.array(
        z
          .object({
            kind: z
              .enum(['missing_operation', 'insufficient_contract'])
              .describe(
                'Proposed gap in the supplied contracts, not proof the service has no API.',
              ),
            description: z
              .string()
              .min(1)
              .describe(
                'Unmet scenario requirement and supporting contract detail.',
              ),
            candidateId: z
              .enum(candidateIds)
              .nullable()
              .describe(
                'Existing candidate for an insufficient contract; null for a missing operation.',
              ),
          })
          .strict(),
      ),
    })
    .strict();
}
