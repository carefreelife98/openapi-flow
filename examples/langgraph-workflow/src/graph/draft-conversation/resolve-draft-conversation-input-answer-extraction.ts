import { isDeepStrictEqual } from 'node:util';
import { validateApiInputAnswerAnalysis } from '@openapi-flow/core';
import type { ApiInputAnswerAnalysis } from '@openapi-flow/core';
import type { WorkflowDraftConversationState } from '../../types/workflow-draft-conversation.js';
import { draftConversationReviewToken } from './draft-conversation-review-token.js';

/** Revalidate separately captured source choices against the actual current question/reply. */
export function resolveDraftConversationInputAnswerExtraction(
  state: WorkflowDraftConversationState,
  selectOasEnums?: boolean,
): ApiInputAnswerAnalysis {
  const response = state.response;
  const record = state.inputAnswerExtraction;
  if (
    response?.action !== 'reply-inputs' ||
    !record ||
    record.kind !== 'api-input' ||
    !state.questions ||
    !state.plan
  )
    throw new Error(
      'Natural API input application requires its original extraction result',
    );
  const requirements = state.questions.flatMap((question) =>
    question.kind === 'api-input' && question.requirement
      ? [question.requirement]
      : [],
  );
  if (
    record.messageId !== response.messageId ||
    record.planId !== state.plan.id ||
    record.token !== response.token ||
    record.token !== draftConversationReviewToken(state) ||
    !isDeepStrictEqual(record.context, {
      reply: response.text,
      requirements,
      ...(selectOasEnums === undefined ? {} : { selectOasEnums }),
    })
  )
    throw new Error(
      'Natural API input extraction differs from the current reply or pending OAS contracts',
    );
  validateApiInputAnswerAnalysis({
    reply: response.text,
    requirements,
    ...(selectOasEnums === undefined ? {} : { selectOasEnums }),
    analysis: record.analysis,
  });
  return record.analysis;
}
