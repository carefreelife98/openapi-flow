import { interrupt } from '@langchain/langgraph';
import { z } from 'zod';
import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
  WorkflowDraftConversationReview,
  WorkflowDraftConversationDependencies,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationResponseSchema } from '../../schemas/workflow-draft-conversation-response-schema.js';
import { draftConversationReviewToken } from './draft-conversation-review-token.js';
import { describeDraftConversationReviewSuggestions } from './describe-draft-conversation-review-suggestions.js';
import { describeDraftConversationPlanningResults } from './draft-conversation-context.js';

/** No model or adoption work belongs in this replayed interrupt node. */
export function askDraftConversationReview(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftConversationUpdate {
  if (
    !state.draft ||
    !state.plan ||
    !state.events ||
    !state.issues ||
    (state.phase !== 'selecting' && state.phase !== 'candidate')
  )
    throw new Error(
      'Conversation review requires a current selection/candidate boundary',
    );
  const review: WorkflowDraftConversationReview = {
    phase: state.phase === 'selecting' ? 'selection' : 'candidate',
    token: draftConversationReviewToken(state),
    baseRevision: state.draft.revision,
    planId: state.plan.id,
  };
  const planningResults = describeDraftConversationPlanningResults(
    state,
    dependencies,
  );
  const raw = interrupt(
    {
      kind: 'draft-review',
      ...review,
      plan: state.plan,
      ...(planningResults === undefined ? {} : { planningResults }),
      ...(state.nativeFeatures === undefined
        ? {}
        : { nativeFeatures: state.nativeFeatures }),
      ...(state.clarification === undefined
        ? {}
        : { clarification: state.clarification }),
      ...(state.clarificationScopes === undefined
        ? {}
        : { clarificationScopes: state.clarificationScopes }),
      ...(state.candidate === undefined
        ? {}
        : {
            candidate: state.candidate.result,
            preview: state.candidate.preview,
          }),
      issues: state.issues,
      ...describeDraftConversationReviewSuggestions(state, dependencies),
      actions: [
        'approve',
        'revise',
        ...(state.clarification?.confirmedAnswerMessageIds.length
          ? ['revise-clarification']
          : []),
        ...(state.reviewSuggestions === undefined ? [] : ['adopt-suggestion']),
        'cancel',
      ],
    },
    { responseSchema: z.toJSONSchema(draftConversationResponseSchema) },
  );
  const parsed = draftConversationResponseSchema.safeParse(raw);
  if (!parsed.success)
    return {
      review,
      issues: parsed.error.issues.map((issue) => issue.message),
      response: undefined,
    };
  if (parsed.data.token !== review.token)
    return {
      review,
      issues: [
        '검토 대상이 바뀌었습니다. 현재 검토 토큰으로 다시 응답해 주세요.',
      ],
      response: undefined,
    };
  if (
    parsed.data.action === 'revise-clarification' &&
    !state.clarification?.confirmedAnswerMessageIds.length
  )
    return {
      review,
      issues: ['현재 변경할 확정 답변이 없습니다.'],
      response: undefined,
    };
  if (
    parsed.data.action === 'answer-inputs' ||
    parsed.data.action === 'reply-inputs' ||
    parsed.data.action === 'answer-api-bindings' ||
    parsed.data.action === 'answer-requirement' ||
    parsed.data.action === 'answer-clarification'
  )
    return {
      review,
      issues: ['이 단계에서는 승인·추가 지시·취소 중 하나로 응답해 주세요.'],
      response: undefined,
    };
  if (parsed.data.action === 'cancel')
    return {
      review,
      response: undefined,
      issues: [],
      phase: 'cancelled',
      events: [...state.events, { kind: 'cancelled', id: state.plan.id }],
    };
  if (
    parsed.data.action === 'revise' ||
    parsed.data.action === 'revise-clarification' ||
    parsed.data.action === 'adopt-suggestion'
  )
    return { review, response: parsed.data, issues: [] };
  return {
    review,
    response: undefined,
    issues: [],
    ...(review.phase === 'selection'
      ? { selectionApproved: true, phase: 'planning' as const }
      : { candidateApproved: true, phase: 'adopting' as const }),
    events: [...state.events, { kind: 'review', id: review.token }],
  };
}
