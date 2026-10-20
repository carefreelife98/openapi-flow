import { interrupt } from '@langchain/langgraph';
import { z } from 'zod';
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
    !state.confirmedInputs ||
    !state.inputAnswerIssues
  )
    throw new Error(
      'request clarification requires contracts, pending arguments, requirements and confirmed inputs',
    );
  // One interrupt per invocation; invalid replies are persisted before the graph asks again.
  const response = inputAnswersResponseSchema.safeParse(
    interrupt(
      {
        kind: 'request-input',
        questions: state.requirements,
        issues: state.inputAnswerIssues,
      },
      { responseSchema: z.toJSONSchema(inputAnswersResponseSchema) },
    ),
  );
  if (!response.success) {
    return {
      pendingInputResponse: undefined,
      conversationStatus: 'awaiting-input',
      inputAnswerIssues: response.error.issues.map((issue) => ({
        requirementId: '',
        message: issue.message,
      })),
    };
  }
  if (response.data.action === 'cancel')
    return { conversationStatus: 'cancelled', pendingInputResponse: undefined };
  return { pendingInputResponse: response.data, inputAnswerIssues: [] };
}
