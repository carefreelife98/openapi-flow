import { interrupt } from '@langchain/langgraph';
import type { ApiAnswerIssue } from '@openapi-flow/core';
import type {
  ConversationState,
  ConversationUpdate,
} from '../../types/workflow-conversation.js';
import { inputAnswersResponseSchema } from '../../schemas/conversation-response-schema.js';

/** Validate typed answers with OSS contracts; never concatenate them into a new prompt. */
export function askRequestInputs(state: ConversationState): ConversationUpdate {
  if (
    !state.contracts ||
    !state.pendingArguments ||
    !state.requirements?.length ||
    !state.reviewMaterials ||
    !state.confirmedInputs
  )
    throw new Error(
      'request clarification requires contracts, pending arguments, requirements and confirmed inputs',
    );
  let issues: ApiAnswerIssue[] = state.inputAnswerIssues ?? [];
  while (true) {
    const response = inputAnswersResponseSchema.safeParse(
      interrupt({
        kind: 'request-input',
        questions: state.requirements,
        issues,
      }),
    );
    if (!response.success) {
      issues = response.error.issues.map((issue) => ({
        requirementId: '',
        message: issue.message,
      }));
      continue;
    }
    if (response.data.action === 'cancel')
      return { conversationStatus: 'cancelled' };
    return { pendingInputResponse: response.data, inputAnswerIssues: [] };
  }
}
