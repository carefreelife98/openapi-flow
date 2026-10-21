import {
  resolveWorkflowDraftApiInputEdits,
  stageWorkflowDraftEdit,
} from '@openapi-flow/core';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationEditInput } from './draft-conversation-context.js';
import { describeDraftConversationApiInputEditQuestions } from './describe-draft-conversation-api-input-edit-questions.js';

/** Apply real typed submissions to the unchanged proposal; never manufacture text evidence. */
export function applyDraftConversationApiInputEditAnswers(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  if (
    state.response?.action !== 'answer-api-input-edits' ||
    !state.messages ||
    !state.requestIds ||
    !state.bundles ||
    !state.questions ||
    !state.stageResults ||
    !state.apiInputEditAnswerHistory ||
    !state.resolutions ||
    !state.events
  )
    throw new Error(
      'API edit answers require initialized question and planning state',
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
  const questions = state.questions.filter(
    (question) =>
      question.kind === 'api-input-edit' && question.stepId === response.stepId,
  );
  if (
    !questions.length ||
    response.confirmedAnswers.answers.some(
      (answer) =>
        !questions.some(
          (question) =>
            question.apiInputEditContractId ===
              response.confirmedAnswers.contractId &&
            question.apiInputEditTarget?.id === answer.targetId,
        ),
    )
  )
    return {
      issues: ['현재 미확정 API 입력 수정 질문에만 답할 수 있습니다.'],
      response: undefined,
    };
  const bundle = state.bundles.find((item) => item.stepId === response.stepId);
  const key = `api-input-values:${response.stepId}`;
  const previous = state.stageResults[key];
  if (
    !bundle?.apiInputContract ||
    !previous ||
    !('pendingTargets' in previous) ||
    previous.status !== 'needs-input'
  )
    throw new Error(
      'API edit answer requires its original pending contract and value proposal',
    );
  const input = draftConversationEditInput(state, dependencies);
  if (
    !stageWorkflowDraftEdit(input).pendingResolutionStepIds.includes(
      response.stepId,
    )
  )
    return {
      issues: ['이미 완료했거나 현재 계획에 없는 입력 수정 단계입니다.'],
      response: undefined,
    };
  try {
    const result = resolveWorkflowDraftApiInputEdits({
      ...input,
      resolutions: bundle.resolutions,
      repairs: bundle.repairs,
      stepId: bundle.stepId,
      contract: bundle.apiInputContract,
      output: previous.values,
      confirmedAnswers: {
        ...response.confirmedAnswers,
        answers: [
          ...(previous.confirmedAnswers === undefined
            ? []
            : previous.confirmedAnswers.answers),
          ...response.confirmedAnswers.answers,
        ],
      },
    });
    const resolutions =
      result.status === 'ready'
        ? [...state.resolutions, result.resolution]
        : state.resolutions;
    stageWorkflowDraftEdit({ ...input, resolutions });
    return {
      stageResults: { ...state.stageResults, [key]: result },
      resolutions,
      questions: [
        ...state.questions.filter(
          (question) =>
            !(
              question.kind === 'api-input-edit' &&
              question.stepId === response.stepId
            ),
        ),
        ...describeDraftConversationApiInputEditQuestions(
          response.stepId,
          result,
        ),
      ],
      apiInputEditAnswerHistory: [
        ...state.apiInputEditAnswerHistory,
        {
          messageId: response.messageId,
          stepId: response.stepId,
          confirmedAnswers: structuredClone(response.confirmedAnswers),
        },
      ],
      requestIds: [...state.requestIds, response.messageId],
      events: [
        ...state.events,
        { kind: 'api-input-edit-answer', id: response.messageId },
      ],
      response: undefined,
      issues: [],
      phase: 'planning',
    };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return {
      issues: [`API 입력 수정 답변을 적용하지 못했습니다: ${error.message}`],
      response: undefined,
    };
  }
}
