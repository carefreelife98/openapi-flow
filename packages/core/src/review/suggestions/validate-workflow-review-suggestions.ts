import { isDeepStrictEqual } from 'node:util';
import type { WorkflowReviewSuggestionsValidationInput } from '../../types/workflow-review-suggestions.js';
import { createWorkflowReviewSuggestions } from './create-workflow-review-suggestions.js';
import { workflowReviewSuggestionsRecordSchema } from '../../schemas/workflow-review-suggestions-record-schema.js';

export function validateWorkflowReviewSuggestions(
  input: WorkflowReviewSuggestionsValidationInput,
): void {
  if (!input.review || !Array.isArray(input.review.suggestions))
    throw new Error(
      'Review suggestions require an original host-owned review record',
    );
  workflowReviewSuggestionsRecordSchema.parse(input.review);
  const expected = createWorkflowReviewSuggestions({
    ...input,
    proposal: {
      suggestions: input.review.suggestions.map(({ id, ...suggestion }) => {
        if (!id.trim())
          throw new Error('Review suggestion id must be non-empty');
        return suggestion;
      }),
    },
  });
  if (!isDeepStrictEqual(expected, input.review))
    throw new Error(
      'Review suggestions are stale or have modified identities, text, sources or settings',
    );
}
