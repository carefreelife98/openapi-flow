import { createHash } from 'node:crypto';
import type { WorkflowDraftConversationState } from '../../types/workflow-draft-conversation.js';

export function draftConversationReviewSourceToken(
  state: WorkflowDraftConversationState,
): string {
  if (!state.draft || !state.phase)
    throw new Error('Conversation review requires draft and phase');
  return createHash('sha256')
    .update(
      JSON.stringify({
        phase: state.phase,
        baseRevision: state.draft.revision,
        draft: state.draft,
        plan: state.plan,
        nativeDependencies: state.nativeDependencies,
        stageResults: state.stageResults,
        connectionResult: state.connectionResult,
        structuralConnectionResult: state.structuralConnectionResult,
        inputAnswerHistory: state.inputAnswerHistory,
        apiInputEditAnswerHistory: state.apiInputEditAnswerHistory,
        candidate: state.candidate?.result,
        questions: state.questions,
        resolutions: state.resolutions,
        repairs: state.repairs,
        clarification: state.clarification,
        clarificationScopes: state.clarificationScopes,
        clarificationAnswerRevisions: state.clarificationAnswerRevisions,
        inactiveClarificationMessageIds: state.inactiveClarificationMessageIds,
      }),
    )
    .digest('hex');
}

/** The UI must confirm the actual suggestion record as well as its original review state. */
export function draftConversationReviewToken(
  state: WorkflowDraftConversationState,
): string {
  const source = draftConversationReviewSourceToken(state);
  return state.reviewSuggestions === undefined
    ? source
    : createHash('sha256')
        .update(JSON.stringify([source, state.reviewSuggestions]))
        .digest('hex');
}
