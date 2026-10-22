import {
  validateWorkflowDraftEditPlan,
  validateWorkflowDraftNativeDependencies,
} from '@openapi-flow/core';
import { describeN8nManualTrigger } from '@openapi-flow/n8n';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
  WorkflowDraftConversationBundle,
  WorkflowDraftConversationUpdate,
  WorkflowDraftConversationQuestion,
  PreparedDraftConversationInput,
  WorkflowDraftConversationStageResult,
  WorkflowDraftConversationEditInput,
  WorkflowDraftConversationPlanningResults,
} from '../../types/workflow-draft-conversation.js';
import { activeDraftConversationMessages } from './active-draft-conversation-messages.js';
import type { VerifiedWorkflowDraftApiEnumSelection } from '@openapi-flow/core';

/** Enum interpretation always requires visible attribution, independently of debug explanations. */
export function describeDraftConversationEnumSelections(
  state: WorkflowDraftConversationState,
): VerifiedWorkflowDraftApiEnumSelection[] {
  if (!state.stageResults || !state.inputAnswerHistory)
    throw new Error(
      'Enum review requires initialized stageResults and inputAnswerHistory',
    );
  return structuredClone([
    ...Object.values(state.stageResults).flatMap((result) =>
      'enumSelections' in result ? (result.enumSelections ?? []) : [],
    ),
    ...state.inputAnswerHistory
      .filter((record) => record.planId === state.plan?.id)
      .flatMap((record) =>
        (record.analysis.enumSelections ?? []).map((selection) => ({
          ...selection.candidate,
          candidateId: selection.candidateId,
          messageId: record.messageId,
          sourceText: selection.intent.sourceText,
          reason: selection.reason,
          occurrences: selection.occurrences,
        })),
      ),
  ]);
}

/** Display original records only; do not summarize, regenerate or grant mutation authority. */
export function describeDraftConversationPlanningResults(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationPlanningResults | undefined {
  if (!dependencies.includeExplanations) return undefined;
  if (!state.stageResults || !state.inputAnswerHistory)
    throw new Error(
      'Planning result display requires initialized stageResults and inputAnswerHistory',
    );
  return structuredClone({
    ...(state.plan === undefined ? {} : { plan: state.plan }),
    stageResults: state.stageResults,
    ...(state.structuralConnectionResult === undefined
      ? {}
      : { structuralConnectionResult: state.structuralConnectionResult }),
    ...(state.connectionResult === undefined
      ? {}
      : { connectionResult: state.connectionResult }),
    inputAnswerHistory: state.inputAnswerHistory,
  });
}

export function draftConversationContext(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
) {
  if (!state.turnMessages)
    throw new Error('Draft conversation requires initialized turnMessages');
  return {
    ...dependencies.context,
    messages: state.turnMessages,
    planningMessageIds: activeDraftConversationMessages(
      state.turnMessages,
      state.inactiveClarificationMessageIds,
    ).map((message) => message.id),
    ...(dependencies.clarification === undefined
      ? {}
      : { entrypoint: describeN8nManualTrigger() }),
    ...(state.clarification === undefined
      ? {}
      : { clarification: state.clarification }),
  };
}
export function draftConversationEditInput(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationEditInput {
  if (
    !state.draft ||
    !state.plan ||
    !state.requestMessageIds ||
    !state.resolutions ||
    !state.repairs
  )
    throw new Error(
      'Draft conversation planning state is missing draft, plan, requestMessageIds, resolutions or repairs',
    );
  const input = {
    draft: state.draft,
    context: draftConversationContext(state, dependencies),
    plan: state.plan,
    requestMessageIds: state.requestMessageIds,
    resolutions: state.resolutions,
    repairs: state.repairs,
    ...(state.nativeDependencies === undefined
      ? {}
      : { producerDependencies: state.nativeDependencies }),
    ...(state.clarificationScopes === undefined
      ? {}
      : { clarificationScopes: state.clarificationScopes }),
  };
  validateWorkflowDraftEditPlan(input);
  if (state.nativeDependencies !== undefined) {
    if (dependencies.planNativeDependencies !== true)
      throw new Error(
        'Draft native dependency state requires its original enabled planning policy',
      );
    validateWorkflowDraftNativeDependencies({
      ...input,
      producerDependencies: state.nativeDependencies,
    });
  }
  return input;
}
export function draftConversationBundleInput(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): PreparedDraftConversationInput {
  const input = draftConversationEditInput(state, dependencies);
  if (!state.work?.stepId || !state.bundles)
    throw new Error(
      'Draft conversation requires an active step and initialized bundles',
    );
  const existing = state.bundles.find(
    (bundle) => bundle.stepId === state.work!.stepId,
  );
  const bundle: WorkflowDraftConversationBundle =
    existing === undefined
      ? {
          stepId: state.work.stepId,
          resolutions: structuredClone(input.resolutions),
          repairs: structuredClone(input.repairs!),
        }
      : structuredClone(existing);
  return {
    input: {
      ...input,
      resolutions: bundle.resolutions,
      repairs: bundle.repairs,
    },
    bundle,
  };
}
export function saveDraftConversationBundle(
  state: WorkflowDraftConversationState,
  bundle: WorkflowDraftConversationBundle,
): WorkflowDraftConversationBundle[] {
  if (!state.bundles)
    throw new Error('Draft conversation requires initialized bundles');
  return [
    ...state.bundles.filter((item) => item.stepId !== bundle.stepId),
    bundle,
  ];
}
export function completeDraftConversationWork(
  state: WorkflowDraftConversationState,
  result: WorkflowDraftConversationStageResult,
  questions: WorkflowDraftConversationQuestion[] = [],
): WorkflowDraftConversationUpdate {
  if (
    !state.work ||
    !state.attempted ||
    !state.questions ||
    !state.events ||
    !state.stageResults
  )
    throw new Error(
      'Draft conversation requires active work and initialized planning state',
    );
  return {
    attempted: [...state.attempted, state.work.key],
    work: undefined,
    stageResults: { ...state.stageResults, [state.work.key]: result },
    questions: [...state.questions, ...questions],
    events: [...state.events, { kind: 'planning-stage', id: state.work.key }],
    phase: 'planning',
  };
}
