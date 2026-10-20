import { z } from 'zod';
import {
  workflowReviewSuggestionLimitsSchema,
  workflowReviewSuggestionOptionsSchema,
} from './workflow-review-suggestion-settings-schema.js';
import { workflowReviewBoundarySchema } from './workflow-review-suggestion-settings-schema.js';

/** Structural gate before reconstructing every canonical suggestion from its original proposal. */
export const workflowReviewSuggestionsRecordSchema = z.strictObject({
  id: z.string().min(1),
  fingerprint: z.string().min(1),
  boundaryKey: z.string().min(1),
  target: workflowReviewBoundarySchema.omit({ key: true }),
  limits: workflowReviewSuggestionLimitsSchema,
  options: workflowReviewSuggestionOptionsSchema,
  suggestions: z.array(z.object({ id: z.string().min(1) }).passthrough()),
});
