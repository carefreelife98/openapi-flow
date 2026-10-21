import { interrupt } from '@langchain/langgraph';
import { z } from 'zod';
import { stageWorkflowDraftEdit } from '@openapi-flow/core';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationResponseSchema } from '../../schemas/workflow-draft-conversation-response-schema.js';
import { draftConversationReviewToken } from './draft-conversation-review-token.js';
import {
  draftConversationEditInput,
  describeDraftConversationPlanningResults,
} from './draft-conversation-context.js';
import { describeDraftConversationReviewSuggestions } from './describe-draft-conversation-review-suggestions.js';

export function askDraftConversationQuestions(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  if (!state.questions || !state.issues || !state.events)
    throw new Error(
      'Conversation questions require initialized question state',
    );
  const stage = stageWorkflowDraftEdit(
    draftConversationEditInput(state, dependencies),
  );
  const token = draftConversationReviewToken(state);
  const planningResults = describeDraftConversationPlanningResults(
    state,
    dependencies,
  );
  const raw = interrupt(
    {
      kind: 'draft-questions',
      token,
      baseRevision: state.draft!.revision,
      questions: state.questions,
      ...(planningResults === undefined ? {} : { planningResults }),
      ...(state.nativeFeatures === undefined
        ? {}
        : { nativeFeatures: state.nativeFeatures }),
      pendingResolutionStepIds: stage.pendingResolutionStepIds,
      pendingRepairs: stage.pendingRepairs,
      staged: stage.content,
      clarificationOwnership: stage.clarificationOwnership,
      stagedValidation: 'not-an-executable-draft',
      issues: state.issues,
      ...describeDraftConversationReviewSuggestions(state, dependencies),
      ...(state.clarification === undefined
        ? {}
        : { clarification: state.clarification }),
      ...(state.clarificationScopes === undefined
        ? {}
        : { clarificationScopes: state.clarificationScopes }),
      actions: [
        'answer-inputs',
        ...(state.questions.some(
          (question) => question.kind === 'api-input-edit',
        )
          ? ['answer-api-input-edits']
          : []),
        ...(state.questions.some((question) => question.kind === 'api-input')
          ? ['reply-inputs']
          : []),
        ...(state.questions.some((question) => question.kind === 'api-binding')
          ? ['answer-api-bindings']
          : []),
        'answer-requirement',
        ...(state.clarification === undefined ? [] : ['answer-clarification']),
        ...(state.clarification?.confirmedAnswerMessageIds.length
          ? ['revise-clarification']
          : []),
        ...(state.reviewSuggestions === undefined ? [] : ['adopt-suggestion']),
        'revise',
        'cancel',
      ],
    },
    { responseSchema: z.toJSONSchema(draftConversationResponseSchema) },
  );
  const parsed = draftConversationResponseSchema.safeParse(raw);
  if (!parsed.success)
    return {
      issues: parsed.error.issues.map((issue) => issue.message),
      response: undefined,
    };
  if (parsed.data.token !== token)
    return {
      issues: [
        '질문 대상이 바뀌었습니다. 현재 질문 토큰으로 다시 응답해 주세요.',
      ],
      response: undefined,
    };
  if (parsed.data.action === 'approve')
    return {
      issues: [
        '미확정 계획은 승인할 수 없습니다. 질문에 답하거나 요청을 수정해 주세요.',
      ],
      response: undefined,
    };
  if (
    parsed.data.action === 'answer-api-input-edits' &&
    !state.questions.some((question) => question.kind === 'api-input-edit')
  )
    return {
      issues: ['현재 답변할 API 입력 수정 질문이 없습니다.'],
      response: undefined,
    };
  if (
    parsed.data.action === 'reply-inputs' &&
    !state.questions.some((question) => question.kind === 'api-input')
  )
    return {
      issues: [
        '현재 자연어로 답할 API 입력 질문이 없습니다. 요청 변경은 revise로 제출해 주세요.',
      ],
      response: undefined,
    };
  if (
    parsed.data.action === 'answer-api-bindings' &&
    !state.questions.some((question) => question.kind === 'api-binding')
  )
    return {
      issues: ['현재 답변할 API 입력 연결 질문이 없습니다.'],
      response: undefined,
    };
  if (
    parsed.data.action === 'revise-clarification' &&
    !state.clarification?.confirmedAnswerMessageIds.length
  )
    return {
      issues: ['현재 변경할 확정 답변이 없습니다.'],
      response: undefined,
    };
  if (
    parsed.data.action === 'answer-clarification' &&
    !state.questions.some((question) => question.kind === 'clarification')
  )
    return {
      issues: ['현재 답변할 요구사항 구체화 질문이 없습니다.'],
      response: undefined,
    };
  if (parsed.data.action === 'cancel')
    return {
      phase: 'cancelled',
      response: undefined,
      issues: [],
      events: [...state.events, { kind: 'cancelled', id: token }],
    };
  return { response: parsed.data, issues: [] };
}
