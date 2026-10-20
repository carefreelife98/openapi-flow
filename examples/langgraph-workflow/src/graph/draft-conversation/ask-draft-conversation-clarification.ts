import { interrupt } from '@langchain/langgraph';
import { z } from 'zod';
import { describeWorkflowDraftClarification } from '@openapi-flow/core';
import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
  WorkflowDraftConversationDependencies,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationResponseSchema } from '../../schemas/workflow-draft-conversation-response-schema.js';
import { draftConversationReviewToken } from './draft-conversation-review-token.js';
import {
  draftConversationContext,
  describeDraftConversationPlanningResults,
} from './draft-conversation-context.js';
import { describeDraftConversationReviewSuggestions } from './describe-draft-conversation-review-suggestions.js';

/** One interrupt only; model calls and answer resolution belong to separate checkpointed nodes. */
export function askDraftConversationClarification(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  if (!state.clarification || !state.draft || !state.issues || !state.events)
    throw new Error(
      'Clarification question requires its original round and current draft',
    );
  const token = draftConversationReviewToken(state);
  describeWorkflowDraftClarification(
    draftConversationContext(state, dependencies),
  );
  const planningResults = describeDraftConversationPlanningResults(
    state,
    dependencies,
  );
  const raw = interrupt(
    {
      kind: 'requirements-clarification',
      token,
      baseRevision: state.draft.revision,
      round: state.clarification.round,
      resolution: state.clarification.resolution,
      ...(planningResults === undefined ? {} : { planningResults }),
      ...(state.nativeFeatures === undefined
        ? {}
        : { nativeFeatures: state.nativeFeatures }),
      ...(state.clarificationScopes === undefined
        ? {}
        : { clarificationScopes: state.clarificationScopes }),
      issues: state.issues,
      ...describeDraftConversationReviewSuggestions(state, dependencies),
      actions: [
        'answer-clarification',
        ...(state.clarification.confirmedAnswerMessageIds.length
          ? ['revise-clarification']
          : []),
        'revise',
        ...(state.reviewSuggestions === undefined ? [] : ['adopt-suggestion']),
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
      issues: ['질문 대상이 바뀌었습니다. 현재 토큰으로 다시 응답해 주세요.'],
      response: undefined,
    };
  if (parsed.data.action === 'cancel')
    return {
      phase: 'cancelled',
      response: undefined,
      issues: [],
      events: [
        ...state.events,
        { kind: 'cancelled', id: state.clarification.round.id },
      ],
    };
  if (
    parsed.data.action !== 'answer-clarification' &&
    parsed.data.action !== 'revise-clarification' &&
    parsed.data.action !== 'adopt-suggestion' &&
    parsed.data.action !== 'revise'
  )
    return {
      issues: ['현재 요구사항 질문에 답하거나 요청을 수정해 주세요.'],
      response: undefined,
    };
  return { response: parsed.data, issues: [] };
}
