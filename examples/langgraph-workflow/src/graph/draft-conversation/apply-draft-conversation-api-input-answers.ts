import {
  validateApiInputAnswers,
  describeWorkflowDraftApiCallArguments,
  resolveWorkflowDraftApiCallArguments,
} from '@openapi-flow/core';
import type { ApiInputAnswer } from '@openapi-flow/core';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationEditInput } from './draft-conversation-context.js';
import { resolveDraftConversationInputAnswerExtraction } from './resolve-draft-conversation-input-answer-extraction.js';

/** Typed and natural answers share the same deterministic OAS application path. */
export function applyDraftConversationApiInputAnswers(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  const response = state.response;
  if (
    !response ||
    (response.action !== 'answer-inputs' &&
      response.action !== 'reply-inputs') ||
    !state.questions ||
    !state.messages ||
    !state.requestIds ||
    !state.bundles ||
    !state.apiArgumentResults ||
    !state.resolutions ||
    !state.events
  )
    throw new Error(
      'API input application requires an actual pending answer and complete planning state',
    );
  const messageId = response.messageId;
  const requirements = state.questions.flatMap((question) =>
    question.kind === 'api-input' && question.requirement
      ? [question.requirement]
      : [],
  );
  const analysis =
    response.action === 'reply-inputs'
      ? resolveDraftConversationInputAnswerExtraction(
          state,
          dependencies.selectOasEnums,
        )
      : undefined;
  let answers: ApiInputAnswer[];
  const natural: WorkflowDraftConversationUpdate = {};
  if (response.action === 'answer-inputs') answers = response.answers;
  else {
    if (!analysis || !state.inputAnswerExtraction)
      throw new Error(
        'Natural input answers require the original validated extraction',
      );
    answers = analysis.answers;
    natural.messages = [
      ...state.messages,
      { id: messageId, text: response.text },
    ];
    natural.requestIds = [...state.requestIds, messageId];
    natural.inputAnswerHistory = [
      ...(state.inputAnswerHistory === undefined
        ? []
        : state.inputAnswerHistory),
      structuredClone(state.inputAnswerExtraction),
    ];
    natural.inputAnswerExtraction = undefined;
  }
  if (response.action === 'reply-inputs' && !answers.length)
    return {
      ...natural,
      issues: [
        '답변에 현재 질문의 입력값이 없습니다. 값을 명시해 주세요. 작업 범위를 바꾸려면 revise로 제출해 주세요.',
      ],
      response: undefined,
    };
  const checked = validateApiInputAnswers({
    requirements,
    answers,
    operations: dependencies.context.operations.map(
      (operation) => operation.key,
    ),
  });
  if (checked.status === 'invalid-answer')
    return {
      ...natural,
      issues: checked.issues.map((issue) => issue.message),
      response: undefined,
    };
  const input = draftConversationEditInput(state, dependencies);
  const bundles = structuredClone(state.bundles);
  const results = { ...state.apiArgumentResults };
  if (!state.stageResults)
    throw new Error('Typed input answers require initialized stageResults');
  const stageResults = { ...state.stageResults };
  const resolutions = [...state.resolutions];
  const affected = new Set(checked.confirmedInputs.map((item) => item.callId));
  for (const bundle of bundles) {
    const previous = results[bundle.stepId];
    if (!previous || !affected.has(previous.arguments.callId)) continue;
    if (previous.status !== 'needs-input' || !bundle.bindingPlan)
      throw new Error(
        'Typed answer targets must have an actual pending API argument result',
      );
    const confirmedInputs = [
      ...(bundle.confirmedInputs === undefined ? [] : bundle.confirmedInputs),
      ...checked.confirmedInputs.filter(
        (item) => item.callId === previous.arguments.callId,
      ),
    ];
    const args = {
      ...input,
      resolutions: bundle.resolutions,
      repairs: bundle.repairs,
      stepId: bundle.stepId,
      requestMediaType: bundle.requestMediaType,
      bindingPlan: bundle.bindingPlan,
      confirmedInputs,
      allowRuntimeInputs: dependencies.allowRuntimeInputs,
      trackRequestedInputs: dependencies.trackRequestedApiInputs,
    };
    const result = resolveWorkflowDraftApiCallArguments({
      ...args,
      fingerprint: describeWorkflowDraftApiCallArguments(args).fingerprint,
      proposal: previous.proposal,
      ...(previous.enumSelections === undefined
        ? {}
        : {
            enumSelections: previous.enumSelections.map((selection) => ({
              candidateId: selection.candidateId,
              messageId: selection.messageId,
              sourceText: selection.sourceText,
              reason: selection.reason,
            })),
          }),
    });
    bundle.confirmedInputs = confirmedInputs;
    results[bundle.stepId] = result;
    stageResults[`api-arguments:${bundle.stepId}`] = result;
    if (result.status === 'ready') resolutions.push(result.resolution);
  }
  const oldRequirementIds = new Set(requirements.map((item) => item.id));
  const questions = state.questions.filter(
    (question) => !oldRequirementIds.has(question.id),
  );
  for (const result of Object.values(results))
    if (result.status === 'needs-input')
      for (const requirement of result.requirements)
        questions.push({
          id: requirement.id,
          kind: 'api-input',
          stepId: bundles.find((bundle) => results[bundle.stepId] === result)!
            .stepId,
          message: requirement.message,
          requirement,
        });
  return {
    messages: [
      ...state.messages,
      {
        id: messageId,
        text: JSON.stringify({
          kind: 'typed-api-input-answers',
          answers,
        }),
      },
    ],
    requestIds: [...state.requestIds, messageId],
    bundles,
    apiArgumentResults: results,
    stageResults,
    resolutions,
    questions,
    response: undefined,
    issues: [],
    phase: 'planning',
    events: [...state.events, { kind: 'input-answer', id: messageId }],
    ...natural,
  };
}
