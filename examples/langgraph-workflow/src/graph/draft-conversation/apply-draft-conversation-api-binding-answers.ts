import { resolveWorkflowDraftApiCallBindings } from '@openapi-flow/core';
import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationEditInput } from './draft-conversation-context.js';

/** Explicit source decisions stay in their original planning snapshot. No model, reanalysis or implicit source selection. */
export function applyDraftConversationApiBindingAnswers(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  if (
    state.response?.action !== 'answer-api-bindings' ||
    !state.messages ||
    !state.requestIds ||
    !state.bundles ||
    !state.questions ||
    !state.stageResults ||
    !state.events
  )
    throw new Error(
      'Binding answers require initialized question and planning state',
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
  if (
    response.answers.some(
      (answer) =>
        !state.questions!.some(
          (question) =>
            question.kind === 'api-binding' &&
            question.id === answer.questionId,
        ),
    )
  )
    return {
      issues: ['현재 미확정 API 입력 연결 질문에만 답할 수 있습니다.'],
      response: undefined,
    };
  const input = draftConversationEditInput(state, dependencies);
  const bundles = structuredClone(state.bundles);
  const stageResults = { ...state.stageResults };
  const resolvedQuestions = new Set<string>();
  try {
    for (const bundle of bundles) {
      const previous = bundle.bindingQuestionPlan;
      if (!previous) continue;
      const answers = response.answers.filter((answer) =>
        previous.questions.some(
          (question) => question.id === answer.questionId,
        ),
      );
      if (!answers.length) continue;
      const result = resolveWorkflowDraftApiCallBindings({
        ...input,
        resolutions: bundle.resolutions,
        repairs: bundle.repairs,
        stepId: bundle.stepId,
        requestMediaType: bundle.requestMediaType,
        fingerprint: previous.fingerprint,
        proposal: previous.proposal,
        ...(previous.inputIntent === undefined
          ? {}
          : { inputIntent: previous.inputIntent }),
        answers: [
          ...(previous.answers === undefined ? [] : previous.answers),
          ...answers,
        ],
      });
      stageResults[`api-bindings:${bundle.stepId}`] = result;
      if (result.status === 'ready') {
        bundle.bindingPlan = result;
        delete bundle.bindingQuestionPlan;
      } else bundle.bindingQuestionPlan = result;
      for (const answer of answers) resolvedQuestions.add(answer.questionId);
    }
    if (resolvedQuestions.size !== response.answers.length)
      throw new Error('Binding answer has no original pending planning bundle');
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { issues: [error.message], response: undefined };
  }
  return {
    bundles,
    stageResults,
    questions: state.questions.filter(
      (question) => !resolvedQuestions.has(question.id),
    ),
    messages: [
      ...state.messages,
      {
        id: response.messageId,
        text: JSON.stringify({
          kind: 'typed-api-binding-answers',
          answers: response.answers,
        }),
      },
    ],
    requestIds: [...state.requestIds, response.messageId],
    events: [
      ...state.events,
      { kind: 'binding-answer', id: response.messageId },
    ],
    response: undefined,
    issues: [],
    phase: 'planning',
  };
}
