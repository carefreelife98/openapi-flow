import { z } from 'zod';

export function withApiSelectionExplanation<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape, z.core.$strict>,
  includeExplanations: boolean,
) {
  z.boolean().parse(includeExplanations);
  return includeExplanations
    ? schema.extend({
        explanation: z.strictObject({
          reason: z
            .string()
            .min(1)
            .refine((value) => value.trim().length > 0)
            .describe(
              'Short user-facing reason in the scenario language for this selection, missing capability or consequential API choice. Use only the supplied scenario and discovery metadata; code attaches those unchanged sources. Do not claim request, response or security contract validation, or expose private chain-of-thought.',
            ),
        }),
      })
    : schema;
}
