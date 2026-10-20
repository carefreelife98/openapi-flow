import { z } from 'zod';
import type {
  AdoptWorkflowReviewSuggestionInput,
  WorkflowReviewSuggestionAdoption,
} from '../../types/workflow-review-suggestions.js';
import { validateWorkflowReviewSuggestions } from './validate-workflow-review-suggestions.js';

/** The caller must authenticate the human action. This receipt authorizes no implicit graph edit. */
export function adoptWorkflowReviewSuggestion(
  input: AdoptWorkflowReviewSuggestionInput,
): WorkflowReviewSuggestionAdoption {
  validateWorkflowReviewSuggestions(input);
  const messageId = z
    .string()
    .refine((id) => id.trim().length > 0)
    .parse(input.messageId);
  if (input.context.messages.some((message) => message.id === messageId))
    throw new Error(
      `Review suggestion adoption message id already exists: ${messageId}`,
    );
  const suggestion = input.review.suggestions.find(
    (item) => item.id === input.suggestionId,
  );
  if (!suggestion)
    throw new Error(
      `Review suggestion adoption references unknown suggestion ${input.suggestionId}`,
    );
  return {
    reviewId: input.review.id,
    suggestionId: suggestion.id,
    boundaryKey: input.review.boundaryKey,
    suggestion: structuredClone(suggestion),
    message: {
      id: messageId,
      text: JSON.stringify({
        kind: 'user-adopted-workflow-review-suggestion',
        reviewId: input.review.id,
        suggestionId: suggestion.id,
        boundaryKey: input.review.boundaryKey,
        intent: suggestion.kind,
        ...(suggestion.kind === 'answer-question'
          ? { questionIds: suggestion.questionIds }
          : {}),
        adoptedText: suggestion.text,
      }),
    },
  };
}
