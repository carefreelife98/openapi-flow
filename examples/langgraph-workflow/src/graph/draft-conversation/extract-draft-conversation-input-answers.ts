import { captureApiInputAnswerContext } from '@openapi-flow/core';
import { analyzeApiInputAnswers } from '@openapi-flow/langchain';
import type {
  WorkflowDraftConversationDependencies,
  WorkflowDraftConversationState,
  WorkflowDraftConversationUpdate,
} from '../../types/workflow-draft-conversation.js';
import { draftConversationReviewToken } from './draft-conversation-review-token.js';
import { draftConversationEditInput } from './draft-conversation-context.js';
import { draftConversationResponseSchema } from '../../schemas/workflow-draft-conversation-response-schema.js';

/** A checkpointed model stage, never code inside an interrupt or semantic replanning. */
export async function extractDraftConversationInputAnswers(
  state: WorkflowDraftConversationState,
  dependencies: WorkflowDraftConversationDependencies,
): Promise<WorkflowDraftConversationUpdate> {
  const response = draftConversationResponseSchema.parse(state.response);
  if (
    response?.action !== 'reply-inputs' ||
    !state.questions ||
    !state.messages ||
    !state.requestIds ||
    state.phase !== 'questions'
  )
    throw new Error(
      'Natural input extraction requires a current reply-inputs response and questions state',
    );
  draftConversationEditInput(state, dependencies);
  if (
    state.messages.some((message) => message.id === response.messageId) ||
    state.requestIds.includes(response.messageId)
  )
    return {
      issues: [`메시지 ID가 이미 존재합니다: ${response.messageId}`],
      response: undefined,
      inputAnswerExtraction: undefined,
    };
  const context = captureApiInputAnswerContext({
    reply: response.text,
    requirements: state.questions.flatMap((question) =>
      question.kind === 'api-input' && question.requirement
        ? [question.requirement]
        : [],
    ),
  });
  if (!context.requirements.length)
    throw new Error(
      'Natural input extraction requires actual pending API input contracts',
    );
  const token = draftConversationReviewToken(state);
  if (response.token !== token)
    throw new Error('Natural input extraction received a stale question token');
  const analysis = await analyzeApiInputAnswers({
    ...context,
    model: dependencies.model,
    includeExplanations: dependencies.includeExplanations,
  });
  if (token !== draftConversationReviewToken(state))
    throw new Error(
      'Natural input extraction question state changed during the model invocation',
    );
  return {
    inputAnswerExtraction: {
      messageId: response.messageId,
      token,
      context,
      analysis,
    },
  };
}
