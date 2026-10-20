import { adoptWorkflowReviewSuggestion } from '@openapi-flow/core';
import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationReviewSuggestionsContext } from './draft-conversation-review-suggestions-context.js';
import { reviseDraftConversationRequest } from './revise-draft-conversation-request.js';

export function applyDraftConversationSuggestion(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  if (
    state.response?.action !== 'adopt-suggestion' ||
    !state.requestIds ||
    !state.messages ||
    !state.events ||
    !state.suggestionAdoptions
  )
    throw new Error(
      'Suggestion adoption requires initialized original response/history state',
    );
  const response = state.response;
  if (!dependencies.reviewSuggestions || !state.reviewSuggestions)
    return {
      issues: ['현재 채택할 후속 제안이 없습니다.'],
      response: undefined,
    };
  if (
    response.reviewId !== state.reviewSuggestions.id ||
    !state.reviewSuggestions.suggestions.some(
      (suggestion) => suggestion.id === response.suggestionId,
    )
  )
    return {
      issues: ['현재 검토에 표시된 실제 제안 ID로 응답해 주세요.'],
      response: undefined,
    };
  if (
    state.messages.some((message) => message.id === response.messageId) ||
    state.requestIds.includes(response.messageId)
  )
    return {
      issues: [`메시지 ID가 이미 존재합니다: ${response.messageId}`],
      response: undefined,
    };
  const adoption = adoptWorkflowReviewSuggestion({
    ...draftConversationReviewSuggestionsContext(state, dependencies),
    review: state.reviewSuggestions,
    suggestionId: state.response.suggestionId,
    messageId: state.response.messageId,
  });
  return {
    ...reviseDraftConversationRequest(
      {
        ...state,
        response: {
          action: 'revise',
          token: state.response.token,
          message: adoption.message,
        },
      },
      dependencies,
    ),
    suggestionAdoptions: [...state.suggestionAdoptions, adoption],
    events: [
      ...state.events,
      ...(state.plan === undefined
        ? []
        : [{ kind: 'superseded' as const, id: state.plan.id }]),
      { kind: 'suggestion-adopted', id: adoption.suggestionId },
      { kind: 'request', id: adoption.message.id },
    ],
  };
}
