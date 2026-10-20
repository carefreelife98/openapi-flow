import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
  WorkflowDraftConversationClarificationHistory,
} from '../../types/workflow-draft-conversation.js';

export function resetDraftConversationPlanning(): WorkflowDraftConversationUpdate {
  return {
    plan: undefined,
    nativeDependencies: undefined,
    clarificationScopes: undefined,
    resolutions: [],
    repairs: [],
    bundles: [],
    attempted: [],
    stageResults: {},
    questions: [],
    apiArgumentResults: {},
    inputAnswerExtraction: undefined,
    work: undefined,
    candidate: undefined,
    outcome: undefined,
    connectionResult: undefined,
    structuralConnectionResult: undefined,
    review: undefined,
    reviewSuggestions: undefined,
    response: undefined,
    issues: [],
    selectionApproved: false,
    candidateApproved: false,
  };
}
export function archiveDraftConversationClarification(
  state: WorkflowDraftConversationState,
  reason: WorkflowDraftConversationClarificationHistory['reason'],
): WorkflowDraftConversationClarificationHistory[] {
  if (
    !state.clarificationHistory ||
    !state.resolutions ||
    !state.repairs ||
    !state.stageResults
  )
    throw new Error(
      'Clarification history requires initialized planning evidence',
    );
  return [
    ...state.clarificationHistory,
    ...(state.clarification === undefined
      ? []
      : [
          {
            clarification: state.clarification,
            ...(state.clarificationScopes === undefined
              ? {}
              : { clarificationScopes: state.clarificationScopes }),
            ...(state.connectionResult === undefined
              ? {}
              : { connectionResult: state.connectionResult }),
            ...(state.structuralConnectionResult === undefined
              ? {}
              : {
                  structuralConnectionResult: state.structuralConnectionResult,
                }),
            ...(state.candidate === undefined
              ? {}
              : { candidate: state.candidate }),
            ...(state.plan === undefined ? {} : { plan: state.plan }),
            resolutions: state.resolutions,
            repairs: state.repairs,
            stageResults: state.stageResults,
            reason,
          },
        ]),
  ];
}
