import { interrupt } from '@langchain/langgraph';
import { z } from 'zod';
import { resolveApiSelectionAnswers } from '@openapi-flow/core';
import type {
  ConversationState,
  ConversationUpdate,
} from '../../types/workflow-conversation.js';
import { createOperationChoiceResponseSchema } from '../../schemas/conversation-response-schema.js';

/** No model calls or external writes in a replayed interrupt node. */
export async function askOperationChoice(
  state: ConversationState,
): Promise<ConversationUpdate> {
  if (
    !state.catalog ||
    !state.selectionAnalysis?.questions.length ||
    !state.operationAnswerErrors
  )
    throw new Error('operation clarification requires catalog and questions');
  const schema = createOperationChoiceResponseSchema(
    state.selectionAnalysis.questions,
  );
  // One interrupt per invocation. Invalid answers become checkpointed state before re-entry.
  const answer = schema.safeParse(
    interrupt(
      {
        kind: 'operation-choice',
        questions: state.selectionAnalysis.questions,
        errors: state.operationAnswerErrors,
      },
      { responseSchema: z.toJSONSchema(schema) },
    ),
  );
  if (!answer.success) {
    return {
      operationAnswerErrors: answer.error.issues.map((issue) => issue.message),
      conversationStatus: 'awaiting-input',
    };
  }
  if (answer.data.action === 'cancel')
    return { conversationStatus: 'cancelled', operationAnswerErrors: [] };
  const analysis = await resolveApiSelectionAnswers({
    catalog: state.catalog,
    analysis: state.selectionAnalysis,
    answers: answer.data.answers,
  });
  return {
    selectionAnalysis: analysis,
    selection: analysis.selection,
    operationAnswerErrors: [],
    conversationStatus: analysis.questions.length
      ? 'awaiting-input'
      : 'working',
  };
}
