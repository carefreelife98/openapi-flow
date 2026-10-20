import { validateWorkflowReviewSuggestions } from '@openapi-flow/core';
import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationDependencies,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationReviewSuggestionsContext } from './draft-conversation-review-suggestions-context.js';

/** Replayed interrupt nodes do validation only, never model invocation or adoption. */
export function describeDraftConversationReviewSuggestions(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
) {
  if (dependencies.reviewSuggestions === undefined) {
    if (state.reviewSuggestions !== undefined)
      throw new Error(
        'Review suggestion state exists while the feature is disabled',
      );
    return {};
  }
  if (!state.reviewSuggestions)
    throw new Error('Review boundary requires prepared original suggestions');
  validateWorkflowReviewSuggestions({
    ...draftConversationReviewSuggestionsContext(state, dependencies),
    review: state.reviewSuggestions,
  });
  return { reviewSuggestions: structuredClone(state.reviewSuggestions) };
}
