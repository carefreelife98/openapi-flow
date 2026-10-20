import { z } from 'zod';
import type {
  ClarificationQuestionLimits,
  WorkflowClarificationOptions,
} from '../types/workflow-clarification.js';

const positiveInteger = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const clarificationQuestionLimitsSchema = z
  .strictObject({
    maxCategories: positiveInteger,
    maxQuestionsPerCategory: positiveInteger,
    maxChoicesPerQuestion: positiveInteger,
    maxQuestionsPerRound: positiveInteger,
  })
  .refine(
    (limits) =>
      limits.maxQuestionsPerRound / limits.maxQuestionsPerCategory <=
      limits.maxCategories,
    {
      message:
        'maxQuestionsPerRound exceeds the configured category/question capacity',
    },
  ) satisfies z.ZodType<ClarificationQuestionLimits>;
export const workflowClarificationOptionsSchema = z.strictObject({
  includeExplanations: z.boolean().optional(),
  includeSuggestions: z.boolean().optional(),
}) satisfies z.ZodType<WorkflowClarificationOptions>;
