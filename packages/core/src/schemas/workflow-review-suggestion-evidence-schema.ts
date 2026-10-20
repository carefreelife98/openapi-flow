import { z } from 'zod';
import { workflowPlanningEvidenceSchema } from './planning-evidence-schema.js';
import type { WorkflowReviewSuggestionEvidence } from '../types/workflow-review-suggestions.js';

export const workflowReviewSuggestionEvidenceSchema = z.union([
  workflowPlanningEvidenceSchema,
  z.strictObject({
    kind: z.literal('review-question'),
    questionId: z.string().min(1),
  }),
]) satisfies z.ZodType<WorkflowReviewSuggestionEvidence>;
