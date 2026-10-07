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
            description: z
              .string()
              .min(1)
              .describe(
                'Required API capability that no supplied discovery candidate matches. Do not judge missing parameters, response fields or security without a full contract.',
              ),
          })
          .strict(),
      ),
    })
    .strict();
}
