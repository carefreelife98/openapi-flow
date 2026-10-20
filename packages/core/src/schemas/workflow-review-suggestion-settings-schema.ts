import { z } from 'zod';
import type {
  WorkflowReviewBoundary,
  WorkflowReviewSuggestionLimits,
  ResolvedWorkflowReviewSuggestionOptions,
} from '../types/workflow-review-suggestions.js';

export const workflowReviewSuggestionLimitsSchema = z.strictObject({
  maxSuggestions: z.number().int().positive(),
}) satisfies z.ZodType<WorkflowReviewSuggestionLimits>;
export const workflowReviewSuggestionOptionsSchema = z.strictObject({
  includeExplanations: z.boolean().default(true),
  includeExtensions: z.boolean().default(true),
}) satisfies z.ZodType<ResolvedWorkflowReviewSuggestionOptions>;
export const workflowReviewBoundarySchema = z.strictObject({
  key: z.string().refine((value) => value.trim().length > 0),
  kind: z.enum([
    'requirements-clarification',
    'selection-review',
    'planning-questions',
    'candidate-review',
  ]),
  revision: z.number().int().nonnegative(),
  questions: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        message: z.string().refine((value) => value.trim().length > 0),
      }),
    )
    .refine(
      (questions) =>
        new Set(questions.map((question) => question.id)).size ===
        questions.length,
    ),
  data: z.json(),
}) satisfies z.ZodType<WorkflowReviewBoundary>;
