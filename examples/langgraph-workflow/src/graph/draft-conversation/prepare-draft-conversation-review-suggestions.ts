import { suggestWorkflowReviewFollowUps } from '@openapi-flow/langchain';
import { validateWorkflowReviewSuggestions } from '@openapi-flow/core';
import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationReviewSuggestionsContext } from './draft-conversation-review-suggestions-context.js';

/** Checkpoint model work before interrupt. Invalid UI replies do not regenerate suggestions. */
export async function prepareDraftConversationReviewSuggestions(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  if (dependencies.reviewSuggestions === undefined)
    return { reviewSuggestions: undefined };
  if (!state.reviewSuggestionHistory || !state.events)
    throw new Error(
      'Review suggestions require initialized history and events',
    );
  const input = draftConversationReviewSuggestionsContext(state, dependencies);
  if (state.reviewSuggestions?.boundaryKey === input.boundary.key) {
    validateWorkflowReviewSuggestions({
      ...input,
      review: state.reviewSuggestions,
    });
    return {};
  }
  const reviewSuggestions = await suggestWorkflowReviewFollowUps({
    ...input,
    model: dependencies.model,
  });
  return {
    reviewSuggestions,
    reviewSuggestionHistory: [
      ...state.reviewSuggestionHistory,
      reviewSuggestions,
    ],
    events: [
      ...state.events,
      { kind: 'review-suggestions', id: reviewSuggestions.id },
    ],
  };
}
