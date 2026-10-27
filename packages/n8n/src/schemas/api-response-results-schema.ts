import { z } from 'zod';

const sourceSelectionDescription =
  'Selected API callIds to collect as complete unchanged response bodies. Select calls only; code owns provenance, the results list and every output field. Order lists the selected calls, not a downstream data-binding address.';

export const apiResponseResultsParametersSchema = z
  .strictObject({
    sourceNodeIds: z
      .array(z.string().min(1))
      .min(1)
      .describe(sourceSelectionDescription),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.sourceNodeIds.forEach((id, index) => {
      if (seen.has(id))
        context.addIssue({
          code: 'custom',
          path: ['sourceNodeIds', index],
          message: 'API sourceNodeIds must be unique',
        });
      seen.add(id);
    });
  });

export function createApiResponseResultsParametersSchema(callIds: string[]) {
  return apiResponseResultsParametersSchema.safeExtend({
    sourceNodeIds: z
      .array(callIds.length ? z.enum(callIds) : z.never())
      .min(1)
      .describe(sourceSelectionDescription),
  });
}
