import type { WorkflowDraftClarification } from '@openapi-flow/core';
import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationClarificationEvidence,
} from '../../types/workflow-draft-conversation.js';

/** Submission envelopes are events, not persistent requirements. Current per-question receipts retain all unchanged answers. */
export function transitionDraftConversationClarificationEvidence(
  state: WorkflowDraftConversationState,
  after: WorkflowDraftClarification,
): WorkflowDraftConversationClarificationEvidence {
  if (!state.clarification || !state.turnRequestMessageIds)
    throw new Error(
      'Clarification evidence transition requires original round and request IDs',
    );
  const inactive = new Set([
    ...(state.inactiveClarificationMessageIds === undefined
      ? []
      : state.inactiveClarificationMessageIds),
    ...(state.clarificationResponseMessageIds === undefined
      ? []
      : state.clarificationResponseMessageIds),
    ...state.clarification.answerMessages
      .filter(
        (message) =>
          !after.answerMessages.some((current) => current.id === message.id),
      )
      .map((message) => message.id),
  ]);
  // A later explicit answer may restore an identical content-addressed receipt; action history stays distinct.
  for (const message of after.answerMessages) inactive.delete(message.id);
  return {
    inactiveMessageIds: [...inactive],
    requestMessageIds: state.turnRequestMessageIds.filter(
      (id) => !inactive.has(id),
    ),
  };
}
