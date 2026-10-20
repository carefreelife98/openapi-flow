import { z } from 'zod';

export const workflowDraftEditOptionsSchema = z.strictObject({
  includeExplanations: z.boolean().optional(),
});
export const workflowDraftEditRequestIdsSchema = z
  .array(z.string().min(1))
  .min(1)
  .refine((ids) => new Set(ids).size === ids.length);
