import { z } from 'zod';
import type { ResolvedWorkflowReviewSuggestionOptions } from '../types/workflow-review-suggestions.js';

export const workflowReviewSuggestionReasonSchema = z
  .string()
  .min(1)
  .describe(
    "Concise relevance in the user's language, not private chain-of-thought. Distinguish actual message evidence from unapproved review material; do not claim the user requested a candidate's assumptions. Keep internal candidate IDs and source bookkeeping in structured sources only.",
  );

export function createWorkflowReviewSuggestionFieldsSchema<Evidence>(
  options: ResolvedWorkflowReviewSuggestionOptions,
  evidenceSchema: z.ZodType<Evidence>,
) {
  return z.strictObject({
    text: z
      .string()
      .refine((text) => text.trim().length > 0)
      .describe(
        "A concrete optional message in the user's language. Not a confirmed instruction, a workflow, a value default or a credential. Do not expose internal candidate IDs or bookkeeping references here; use structured sources. Do not present unapproved review assumptions as existing user intent.",
      ),
    sources: z.array(evidenceSchema).min(1),
    ...(options.includeExplanations
      ? { reason: workflowReviewSuggestionReasonSchema }
      : {}),
  });
}
