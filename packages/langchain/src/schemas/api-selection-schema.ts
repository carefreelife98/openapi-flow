import { z } from 'zod';

export function createApiSelectionSchema(candidateIds: string[]) {
  if (candidateIds.length === 0)
    throw new Error('operations must contain candidates for model selection');
  return z
    .object({
      operations: z
        .array(
          z
            .object({
              candidateId: z
                .enum(candidateIds)
                .describe(
                  'Exact identifier from supplied candidates; the same candidate may be used by multiple required call instances.',
                ),
              purpose: z
                .string()
                .min(1)
                .describe(
                  'The scenario role of this one API call instance. Describe separate required calls separately; this is not an execution order.',
                ),
            })
            .strict(),
        )
        .describe(
          'One entry per required API call instance, not a deduplicated API catalog. Repeat a candidateId only when the scenario requires separate calls to that API.',
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
