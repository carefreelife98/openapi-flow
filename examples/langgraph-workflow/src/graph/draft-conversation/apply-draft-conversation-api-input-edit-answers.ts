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
import { resolveDraftConversationApiInputEditAnswerExtraction } from './resolve-draft-conversation-api-input-edit-answer-extraction.js';

/** Typed and source-verified natural replies apply to the unchanged proposal. */
export function applyDraftConversationApiInputEditAnswers(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  if (
    (state.response?.action !== 'answer-api-input-edits' &&
      state.response?.action !== 'reply-api-input-edits') ||
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
  const confirmedAnswers =
    response.action === 'answer-api-input-edits'
      ? response.confirmedAnswers
      : resolveDraftConversationApiInputEditAnswerExtraction(
          state,
          dependencies,
        );
  const natural: WorkflowDraftConversationUpdate = {};
  if (response.action === 'reply-api-input-edits') {
    if (!state.inputAnswerExtraction || !state.inputAnswerHistory)
      throw new Error(
        'Natural API edit answers require initialized extraction and source history',
      );
    natural.messages = [
      ...state.messages,
      { id: response.messageId, text: response.text },
    ];
    natural.requestIds = [...state.requestIds, response.messageId];
    natural.inputAnswerHistory = [
      ...state.inputAnswerHistory,
      structuredClone(state.inputAnswerExtraction),
    ];
    natural.inputAnswerExtraction = undefined;
    if (!confirmedAnswers.answers.length)
      return {
        ...natural,
        issues: [
          '답변에 현재 수정 질문의 새 값이 없습니다. 값을 명시하거나 작업 범위 변경을 요청해 주세요.',
        ],
        response: undefined,
      };
  }
  const questions = state.questions.filter(
    (question) =>
      question.kind === 'api-input-edit' && question.stepId === response.stepId,
  );
  if (
    !questions.length ||
    confirmedAnswers.answers.some(
      (answer) =>
        !questions.some(
          (question) =>
            question.apiInputEditContractId === confirmedAnswers.contractId &&
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
      selectOasEnums: dependencies.selectOasEnums,
      output: previous.values,
      confirmedAnswers: {
        ...confirmedAnswers,
        answers: [
          ...(previous.confirmedAnswers === undefined
            ? []
            : previous.confirmedAnswers.answers),
          ...confirmedAnswers.answers,
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
        ...(response.action === 'answer-api-input-edits'
          ? [
              {
                messageId: response.messageId,
                stepId: response.stepId,
                confirmedAnswers: structuredClone(confirmedAnswers),
              },
            ]
          : []),
      ],
      requestIds: [...state.requestIds, response.messageId],
      events: [
        ...state.events,
        { kind: 'api-input-edit-answer', id: response.messageId },
      ],
      response: undefined,
      issues: [],
      phase: 'planning',
      ...natural,
    };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return {
      issues: [`API 입력 수정 답변을 적용하지 못했습니다: ${error.message}`],
      response: undefined,
    };
  }
}
