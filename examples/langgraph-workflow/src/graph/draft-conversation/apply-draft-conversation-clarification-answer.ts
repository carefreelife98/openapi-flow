import { isDeepStrictEqual } from 'node:util';
import {
  describeWorkflowDraftClarification,
  resolveWorkflowClarificationReplies,
  prepareWorkflowDraftClarification,
} from '@openapi-flow/core';
import type { WorkflowClarificationResolution } from '@openapi-flow/core';
import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationContext } from './draft-conversation-context.js';
import { draftConversationClarificationSourceContext } from './clarify-draft-conversation-request.js';
import { transitionDraftConversationClarificationEvidence } from './transition-draft-conversation-clarification-evidence.js';
import {
  resetDraftConversationPlanning,
  archiveDraftConversationClarification,
} from './reset-draft-conversation-planning.js';

export function applyDraftConversationClarificationAnswer(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  if (
    state.response?.action !== 'answer-clarification' ||
    !state.clarification ||
    !state.messages ||
    !state.events ||
    !state.requestIds ||
    !state.turnRequestMessageIds
  )
    throw new Error(
      'Clarification answer requires a current round and initialized transcript',
    );
  describeWorkflowDraftClarification(
    draftConversationContext(state, dependencies),
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
  const context = draftConversationClarificationSourceContext(
    state,
    dependencies,
  );
  let resolution: WorkflowClarificationResolution;
  try {
    resolution = resolveWorkflowClarificationReplies({
      context,
      round: state.clarification.round,
      previous: state.clarification.resolution,
      replies: response.replies,
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { issues: [error.message], response: undefined };
  }
  const clarification = prepareWorkflowDraftClarification({
    context,
    round: state.clarification.round,
    resolution,
  });
  const evidence = transitionDraftConversationClarificationEvidence(
    state,
    clarification,
  );
  const messages = [
    ...state.messages,
    {
      id: response.messageId,
      text: JSON.stringify({
        kind: 'explicit-clarification-replies',
        roundId: clarification.round.id,
        replies: response.replies,
      }),
    },
  ];
  for (const receipt of clarification.answerMessages) {
    const previous = messages.find((message) => message.id === receipt.id);
    if (previous !== undefined) {
      if (!isDeepStrictEqual(previous, receipt))
        throw new Error(
          `Clarification reply evidence ${receipt.id} conflicts with the original transcript`,
        );
    } else messages.push(receipt);
  }
  return {
    ...resetDraftConversationPlanning(),
    clarificationHistory: archiveDraftConversationClarification(
      state,
      'requirements-changed',
    ),
    clarification,
    inactiveClarificationMessageIds: evidence.inactiveMessageIds,
    clarificationResponseMessageIds: [response.messageId],
    messages,
    turnMessages: messages,
    turnRequestMessageIds: evidence.requestMessageIds,
    requestMessageIds: [
      ...new Set([
        ...evidence.requestMessageIds,
        ...clarification.answerMessages.map((message) => message.id),
      ]),
    ],
    requestIds: [...state.requestIds, response.messageId],
    phase: resolution.pendingQuestionIds.length
      ? 'clarification-questions'
      : 'analyzing',
    events: [
      ...state.events,
      ...(state.plan === undefined
        ? []
        : [{ kind: 'superseded' as const, id: state.plan.id }]),
      { kind: 'clarification-answer', id: response.messageId },
    ],
  };
}
