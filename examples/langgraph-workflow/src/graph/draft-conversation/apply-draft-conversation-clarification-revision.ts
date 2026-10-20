import {
  describeWorkflowClarificationAnswerRevision,
  reviseWorkflowClarificationAnswers,
} from '@openapi-flow/core';
import { isDeepStrictEqual } from 'node:util';
import type { WorkflowClarificationAnswerRevisionResult } from '@openapi-flow/core';
import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationContext } from './draft-conversation-context.js';
import { transitionDraftConversationClarificationEvidence } from './transition-draft-conversation-clarification-evidence.js';
import {
  resetDraftConversationPlanning,
  archiveDraftConversationClarification,
} from './reset-draft-conversation-planning.js';

export function applyDraftConversationClarificationRevision(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  if (
    state.response?.action !== 'revise-clarification' ||
    !state.clarification ||
    !state.messages ||
    !state.events ||
    !state.requestIds ||
    !state.turnRequestMessageIds
  )
    throw new Error(
      'Clarification revision requires a current round and initialized transcript',
    );
  const response = state.response;
  if (
    state.messages.some((message) => message.id === response.messageId) ||
    state.requestIds.includes(response.messageId)
  )
    return {
      issues: [`메시지 ID가 이미 존재합니다: ${response.messageId}`],
      response: undefined,
    };
  const context = draftConversationContext(state, dependencies);
  const description = describeWorkflowClarificationAnswerRevision(context);
  let result: WorkflowClarificationAnswerRevisionResult;
  try {
    result = reviseWorkflowClarificationAnswers({
      context,
      fingerprint: description.fingerprint,
      messageId: response.messageId,
      changes: response.changes,
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { issues: [error.message], response: undefined };
  }
  const clarification = result.revision.after;
  const messages = [...state.messages, result.revision.message];
  for (const receipt of clarification.answerMessages) {
    const existing = messages.find((message) => message.id === receipt.id);
    if (existing && !isDeepStrictEqual(existing, receipt))
      throw new Error(
        `Clarification answer evidence conflicts with message ${receipt.id}`,
      );
    if (!existing) messages.push(receipt);
  }
  const evidence = transitionDraftConversationClarificationEvidence(
    state,
    clarification,
  );
  const requestMessageIds = [
    ...new Set([
      ...evidence.requestMessageIds,
      ...clarification.confirmedAnswerMessageIds,
      result.revision.message.id,
    ]),
  ];
  return {
    ...resetDraftConversationPlanning(),
    clarificationHistory: archiveDraftConversationClarification(
      state,
      'requirements-changed',
    ),
    clarificationAnswerRevisions: [
      ...(state.clarificationAnswerRevisions === undefined
        ? []
        : state.clarificationAnswerRevisions),
      result.revision,
    ],
    clarificationResponseMessageIds: [result.revision.message.id],
    inactiveClarificationMessageIds: evidence.inactiveMessageIds,
    clarification,
    messages,
    turnMessages: messages,
    requestMessageIds,
    turnRequestMessageIds: requestMessageIds,
    requestIds: [...state.requestIds, response.messageId],
    phase: clarification.resolution.pendingQuestionIds.length
      ? 'clarification-questions'
      : 'analyzing',
    events: [
      ...state.events,
      ...(state.plan === undefined
        ? []
        : [{ kind: 'superseded' as const, id: state.plan.id }]),
      { kind: 'clarification-revision', id: result.revision.id },
    ],
  };
}
