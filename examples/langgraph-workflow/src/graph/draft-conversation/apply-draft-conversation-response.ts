import {
  stageWorkflowDraftEdit,
  createWorkflowDraftEditCandidateContext,
  describeWorkflowDraftRequirementEdit,
  createWorkflowDraftRequirementAnswerSchema,
} from '@openapi-flow/core';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
  WorkflowDraftConversationRequirementResolution,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationEditInput } from './draft-conversation-context.js';
import { applyDraftConversationClarificationAnswer } from './apply-draft-conversation-clarification-answer.js';
import { reviseDraftConversationRequest } from './revise-draft-conversation-request.js';
import { applyDraftConversationSuggestion } from './apply-draft-conversation-suggestion.js';
import { applyDraftConversationClarificationRevision } from './apply-draft-conversation-clarification-revision.js';
import { applyDraftConversationApiBindingAnswers } from './apply-draft-conversation-api-binding-answers.js';
import { applyDraftConversationApiInputAnswers } from './apply-draft-conversation-api-input-answers.js';
import { applyDraftConversationApiInputEditAnswers } from './apply-draft-conversation-api-input-edit-answers.js';

export function applyDraftConversationResponse(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  if (
    state.response?.action === 'answer-api-input-edits' ||
    state.response?.action === 'reply-api-input-edits'
  )
    return applyDraftConversationApiInputEditAnswers(state, dependencies);
  if (state.response?.action === 'answer-api-bindings')
    return applyDraftConversationApiBindingAnswers(state, dependencies);
  if (state.response?.action === 'revise-clarification')
    return applyDraftConversationClarificationRevision(state, dependencies);
  if (state.response?.action === 'adopt-suggestion')
    return applyDraftConversationSuggestion(state, dependencies);
  if (state.response?.action === 'answer-clarification')
    return applyDraftConversationClarificationAnswer(state, dependencies);
  if (state.response?.action === 'revise')
    return reviseDraftConversationRequest(state, dependencies);
  if (
    !state.response ||
    !state.messages ||
    !state.events ||
    !state.plan ||
    !state.requestMessageIds ||
    !state.requestIds ||
    !state.questions ||
    !state.bundles ||
    !state.apiArgumentResults ||
    !state.resolutions
  )
    throw new Error(
      'Conversation response requires initialized current turn state',
    );
  const response = state.response;
  const messageId =
    response.action === 'answer-inputs' ||
    response.action === 'reply-inputs' ||
    response.action === 'answer-requirement'
      ? response.messageId
      : undefined;
  if (messageId === undefined)
    throw new Error(
      'Only revisions and typed input answers require response application',
    );
  if (
    state.messages.some((message) => message.id === messageId) ||
    state.requestIds.includes(messageId)
  )
    return {
      issues: [`메시지 ID가 이미 존재합니다: ${messageId}`],
      response: undefined,
    };
  if (
    response.action !== 'answer-inputs' &&
    response.action !== 'reply-inputs' &&
    response.action !== 'answer-requirement'
  )
    throw new Error('Unexpected conversation response action');
  if (response.action === 'answer-requirement') {
    const input = draftConversationEditInput(state, dependencies);
    const stage = stageWorkflowDraftEdit(input);
    const step = state.plan.steps.find((item) => item.id === response.stepId);
    if (
      !step ||
      (step.decision.kind !== 'revise-requirement' &&
        step.decision.kind !== 'restore-requirement') ||
      !stage.pendingResolutionStepIds.includes(step.id) ||
      !state.questions.some(
        (question) =>
          question.kind === 'requirement' && question.stepId === step.id,
      )
    )
      return {
        issues: ['현재 미확정 요구사항 수정 단계에만 답할 수 있습니다.'],
        response: undefined,
      };
    const answer = createWorkflowDraftRequirementAnswerSchema(
      describeWorkflowDraftRequirementEdit({ ...input, stepId: step.id }),
    ).safeParse({ answerMessageId: messageId, ...response.requirement });
    if (!answer.success)
      return {
        issues: answer.error.issues.map(
          (issue) => `요구사항 답변 ${issue.path.join('.')}: ${issue.message}`,
        ),
        response: undefined,
      };
    if (!state.stageResults)
      throw new Error('Requirement answers require initialized stageResults');
    const resolution: WorkflowDraftConversationRequirementResolution = {
      stepId: step.id,
      kind: 'requirement',
      ...answer.data,
    };
    const resolutions = [...state.resolutions, resolution];
    stageWorkflowDraftEdit({ ...input, resolutions });
    const candidateContext = createWorkflowDraftEditCandidateContext({
      ...input,
      resolutions,
    });
    const answerMessage = candidateContext.messages.find(
      (message) => message.id === messageId,
    );
    if (!answerMessage)
      throw new Error('Requirement answer has no code-owned source message');
    return {
      resolutions,
      messages: [...state.messages, answerMessage],
      requestIds: [...state.requestIds, messageId],
      stageResults: {
        ...state.stageResults,
        [`requirement-answer:${step.id}`]: {
          kind: 'requirement-answer',
          sourceMessageId: messageId,
          resolution,
        },
      },
      questions: state.questions.filter(
        (question) => question.stepId !== step.id,
      ),
      response: undefined,
      issues: [],
      phase: 'planning',
      events: [...state.events, { kind: 'requirement-answer', id: messageId }],
    };
  }
  return applyDraftConversationApiInputAnswers(state, dependencies);
}
