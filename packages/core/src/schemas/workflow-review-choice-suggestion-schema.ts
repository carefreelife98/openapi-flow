import { z } from 'zod';
import type {
  WorkflowReviewQuestion,
  ProposedWorkflowReviewChoiceSuggestion,
} from '../types/workflow-review-suggestions.js';
import { workflowClarificationReplySchema } from './workflow-clarification-reply-schema.js';
import { workflowReviewQuestionSchema } from './workflow-review-suggestion-settings-schema.js';
import { workflowReviewSuggestionReasonSchema } from './workflow-review-suggestion-fields-schema.js';

export const workflowReviewChoiceReplySchema = z.union([
  workflowClarificationReplySchema.options[0],
  workflowClarificationReplySchema.options[1],
]);

/** One current question, bounded original choices; the model cannot generate its sentence or sources. */
export function createWorkflowReviewChoiceSuggestionSchema(
  question: WorkflowReviewQuestion,
  includeExplanations: boolean,
): z.ZodType<ProposedWorkflowReviewChoiceSuggestion> {
  const original = workflowReviewQuestionSchema.parse(question);
  z.boolean().parse(includeExplanations);
  if (original.answer === undefined)
    throw new Error(
      'Review choice suggestions require an original choice answer contract',
    );
  const ids = original.answer.choices.map((choice) => choice.id);
  const base = z.strictObject({
    kind: z.literal('answer-choice'),
    questionId: z
      .literal(original.id)
      .describe('The exact supplied current question ID, not a new question.'),
    choiceIds: z
      .array(z.enum(ids))
      .min(1)
      .max(original.answer.kind === 'single-choice' ? 1 : ids.length)
      .refine((choices) => new Set(choices).size === choices.length)
      .describe(
        'Select distinct IDs from this original question. Propose an optional answer; do not submit it, invent a choice, rewrite its label or infer an API binding.',
      ),
  });
  return includeExplanations
    ? base.extend({ reason: workflowReviewSuggestionReasonSchema })
    : base;
}
