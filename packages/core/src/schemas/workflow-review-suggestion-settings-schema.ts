import { z } from 'zod';
import type {
  WorkflowReviewBoundary,
  WorkflowReviewSuggestionLimits,
  ResolvedWorkflowReviewSuggestionOptions,
  WorkflowReviewQuestion,
} from '../types/workflow-review-suggestions.js';

export const workflowReviewSuggestionLimitsSchema = z.strictObject({
  maxSuggestions: z.number().int().positive(),
}) satisfies z.ZodType<WorkflowReviewSuggestionLimits>;
export const workflowReviewSuggestionOptionsSchema = z.strictObject({
  includeExplanations: z.boolean().default(true),
  includeExtensions: z.boolean().default(true),
}) satisfies z.ZodType<ResolvedWorkflowReviewSuggestionOptions>;
export const workflowReviewQuestionSchema = z.strictObject({
  id: z.string().min(1),
  message: z.string().refine((value) => value.trim().length > 0),
  answer: z
    .strictObject({
      kind: z.enum(['single-choice', 'multiple-choice']),
      choices: z
        .array(
          z.strictObject({
            id: z.string().min(1),
            label: z.string().refine((value) => value.trim().length > 0),
          }),
        )
        .min(1)
        .refine(
          (choices) =>
            new Set(choices.map((choice) => choice.id)).size === choices.length,
        ),
    })
    .optional(),
}) satisfies z.ZodType<WorkflowReviewQuestion>;
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
    .array(workflowReviewQuestionSchema)
    .refine(
      (questions) =>
        new Set(questions.map((question) => question.id)).size ===
        questions.length,
    ),
  data: z.json(),
}) satisfies z.ZodType<WorkflowReviewBoundary>;
