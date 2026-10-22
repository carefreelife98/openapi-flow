import { isDeepStrictEqual } from 'node:util';
import {
  describeWorkflowDraftApiInputEditAnswerRequirements,
  resolveWorkflowDraftApiInputEditReply,
} from '@openapi-flow/core';
import type { WorkflowDraftApiInputEditAnswers } from '@openapi-flow/core';
import type {
  WorkflowDraftConversationState,
  WorkflowDraftConversationDependencies,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationReviewToken } from './draft-conversation-review-token.js';
import { describeDraftConversationApiInputEditAnswerInput } from './describe-draft-conversation-api-input-edit-answer-input.js';

/** An edit reply cannot change its step, proposal, pending target or question token. */
export function resolveDraftConversationApiInputEditAnswerExtraction(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): WorkflowDraftApiInputEditAnswers {
  const response = state.response;
  const record = state.inputAnswerExtraction;
  if (
    response?.action !== 'reply-api-input-edits' ||
    !record ||
    record.kind !== 'api-input-edit' ||
    !state.plan
  )
    throw new Error(
      'Natural API edit application requires its original extraction result',
    );
  const input = describeDraftConversationApiInputEditAnswerInput(
    state,
    dependencies,
  );
  const context = {
    reply: response.text,
    requirements: describeWorkflowDraftApiInputEditAnswerRequirements(input),
    ...(dependencies.selectOasEnums === undefined
      ? {}
      : { selectOasEnums: dependencies.selectOasEnums }),
  };
  if (
    record.messageId !== response.messageId ||
    record.planId !== state.plan.id ||
    record.stepId !== response.stepId ||
    record.token !== response.token ||
    record.token !== draftConversationReviewToken(state) ||
    !isDeepStrictEqual(record.context, context)
  )
    throw new Error(
      'Natural API edit extraction differs from the current reply, plan, step or pending OAS questions',
    );
  return resolveWorkflowDraftApiInputEditReply({
    ...input,
    reply: response.text,
    analysis: record.analysis,
  });
}
