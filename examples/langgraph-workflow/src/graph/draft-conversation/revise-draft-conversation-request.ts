import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import {
  resetDraftConversationPlanning,
  archiveDraftConversationClarification,
} from './reset-draft-conversation-planning.js';

export function reviseDraftConversationRequest(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  if (
    state.response?.action !== 'revise' ||
    !state.messages ||
    !state.events ||
    !state.requestIds ||
    !state.requestMessageIds ||
    !state.turnRequestMessageIds
  )
    throw new Error('Conversation revision requires initialized request state');
  const message = state.response.message;
  if (
    state.messages.some((item) => item.id === message.id) ||
    state.requestIds.includes(message.id)
  )
    return {
      issues: [`메시지 ID가 이미 존재합니다: ${message.id}`],
      response: undefined,
    };
  const messages = [...state.messages, message];
  const clarification = describeWorkflowDraftClarification(
    draftConversationContext(state, dependencies),
  );
  const requestMessageIds = [
    ...new Set([
      ...state.turnRequestMessageIds,
      ...(clarification === undefined
        ? []
        : clarification.confirmedAnswerMessageIds),
      message.id,
    ]),
  ];
  return {
    ...resetDraftConversationPlanning(),
    clarificationHistory: archiveDraftConversationClarification(
      state,
      'request-superseded',
    ),
    clarification: undefined,
    clarificationResponseMessageIds: [],
    messages,
    turnMessages: messages,
    turnRequestMessageIds: requestMessageIds,
    requestMessageIds,
    requestIds: [...state.requestIds, message.id],
    phase:
      dependencies.clarification === undefined ? 'analyzing' : 'clarifying',
    events: [
      ...state.events,
      ...(state.plan === undefined
        ? []
        : [{ kind: 'superseded' as const, id: state.plan.id }]),
      { kind: 'request', id: message.id },
    ],
  };
}
import { describeWorkflowDraftClarification } from '@openapi-flow/core';
import { draftConversationContext } from './draft-conversation-context.js';
