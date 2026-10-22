import { isDeepStrictEqual } from 'node:util';
import {
  resolveWorkflowDraftApiInputEdits,
  stageWorkflowDraftEdit,
} from '@openapi-flow/core';
import type { ResolveWorkflowDraftApiInputEditsInput } from '@openapi-flow/core';
import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationDependencies,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationEditInput } from './draft-conversation-context.js';
import { describeDraftConversationApiInputEditQuestions } from './describe-draft-conversation-api-input-edit-questions.js';

/** Resolve the actual pending stage, never the question's self-reported schema. */
export function describeDraftConversationApiInputEditAnswerInput(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): ResolveWorkflowDraftApiInputEditsInput {
  const response = state.response;
  if (
    response?.action !== 'reply-api-input-edits' ||
    !state.bundles ||
    !state.stageResults ||
    !state.questions
  )
    throw new Error(
      'Natural API edit reply requires its current response and planning state',
    );
  const input = draftConversationEditInput(state, dependencies);
  if (
    !stageWorkflowDraftEdit(input).pendingResolutionStepIds.includes(
      response.stepId,
    )
  )
    throw new Error(
      'Natural API edit reply targets an absent or completed edit step',
    );
  const bundle = state.bundles.find(
    (bundle) => bundle.stepId === response.stepId,
  );
  const previous = state.stageResults[`api-input-values:${response.stepId}`];
  if (
    !bundle?.apiInputContract ||
    !previous ||
    !('pendingTargets' in previous) ||
    previous.status !== 'needs-input'
  )
    throw new Error(
      'Natural API edit reply requires its original pending contract and proposal',
    );
  const answerInput = {
    ...input,
    resolutions: bundle.resolutions,
    repairs: bundle.repairs,
    stepId: bundle.stepId,
    contract: bundle.apiInputContract,
    selectOasEnums: dependencies.selectOasEnums,
    output: previous.values,
    ...(previous.confirmedAnswers === undefined
      ? {}
      : { confirmedAnswers: previous.confirmedAnswers }),
  };
  const expected = describeDraftConversationApiInputEditQuestions(
    response.stepId,
    resolveWorkflowDraftApiInputEdits(answerInput),
  );
  const actual = state.questions.filter(
    (question) =>
      question.kind === 'api-input-edit' && question.stepId === response.stepId,
  );
  if (!expected.length || !isDeepStrictEqual(expected, actual))
    throw new Error(
      'Natural API edit questions differ from their actual pending OAS contracts',
    );
  return answerInput;
}
