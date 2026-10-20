import { validateWorkflowDraft } from '@openapi-flow/core';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationTurnInputSchema } from '../../schemas/workflow-draft-conversation-input-schema.js';

export function acceptDraftConversationTurn(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  const input = draftConversationTurnInputSchema.parse(state.input);
  if (state.draft && input.initialDraft !== undefined)
    throw new Error(
      'initialDraft is allowed only on the first conversation turn; existing drafts cannot be overwritten',
    );
  if (!state.draft && !input.initialDraft)
    throw new Error('First draft conversation turn requires initialDraft');
  const draft =
    state.draft === undefined
      ? structuredClone(input.initialDraft!)
      : state.draft;
  if (input.request.expectedRevision !== draft.revision)
    throw new Error(
      `Stale conversation request revision: expected ${draft.revision}, received ${input.request.expectedRevision}`,
    );
  const messages =
    state.messages === undefined
      ? structuredClone(dependencies.context.messages)
      : state.messages;
  const requestIds = state.requestIds === undefined ? [] : state.requestIds;
  if (
    requestIds.includes(input.request.id) ||
    messages.some((message) => message.id === input.request.id)
  )
    throw new Error(
      `Draft conversation request id already exists: ${input.request.id}`,
    );
  validateWorkflowDraft({
    draft,
    context: { ...dependencies.context, messages },
  });
  const nextMessages = [
    ...messages,
    { id: input.request.id, text: input.request.text },
  ];
  return {
    draft,
    messages: nextMessages,
    turnMessages: nextMessages,
    requestMessageIds: [input.request.id],
    turnRequestMessageIds: [input.request.id],
    clarification: undefined,
    clarificationResponseMessageIds: [],
    inactiveClarificationMessageIds:
      state.inactiveClarificationMessageIds === undefined
        ? []
        : state.inactiveClarificationMessageIds,
    clarificationAnswerRevisions:
      state.clarificationAnswerRevisions === undefined
        ? []
        : state.clarificationAnswerRevisions,
    clarificationScopes: undefined,
    clarificationHistory: [
      ...(state.clarificationHistory === undefined
        ? []
        : state.clarificationHistory),
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
                    structuralConnectionResult:
                      state.structuralConnectionResult,
                  }),
              ...(state.candidate === undefined
                ? {}
                : { candidate: state.candidate }),
              ...(state.plan === undefined ? {} : { plan: state.plan }),
              resolutions: state.resolutions!,
              repairs: state.repairs!,
              stageResults: state.stageResults!,
              reason: 'next-turn' as const,
            },
          ]),
    ],
    requestIds: [...requestIds, input.request.id],
    plan: undefined,
    nativeDependencies: undefined,
    resolutions: [],
    repairs: [],
    bundles: [],
    attempted: [],
    stageResults: {},
    questions: [],
    apiArgumentResults: {},
    inputAnswerExtraction: undefined,
    inputAnswerHistory:
      state.inputAnswerHistory === undefined ? [] : state.inputAnswerHistory,
    work: undefined,
    candidate: undefined,
    outcome: undefined,
    connectionResult: undefined,
    structuralConnectionResult: undefined,
    review: undefined,
    reviewSuggestions: undefined,
    reviewSuggestionHistory:
      state.reviewSuggestionHistory === undefined
        ? []
        : state.reviewSuggestionHistory,
    suggestionAdoptions:
      state.suggestionAdoptions === undefined ? [] : state.suggestionAdoptions,
    response: undefined,
    issues: [],
    selectionApproved: false,
    candidateApproved: false,
    events: [
      ...(state.events === undefined ? [] : state.events),
      { kind: 'request', id: input.request.id },
    ],
    phase:
      dependencies.clarification === undefined ? 'analyzing' : 'clarifying',
  };
}
