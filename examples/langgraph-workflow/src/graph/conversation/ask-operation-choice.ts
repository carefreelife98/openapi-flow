import { interrupt } from '@langchain/langgraph';
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
  if (!state.catalog || !state.selectionAnalysis?.questions.length)
    throw new Error('operation clarification requires catalog and questions');
  const schema = createOperationChoiceResponseSchema(
    state.selectionAnalysis.questions,
  );
  let errors: string[] = [];
  while (true) {
    const answer = schema.safeParse(
      interrupt({
        kind: 'operation-choice',
        questions: state.selectionAnalysis.questions,
        errors,
      }),
    );
    if (!answer.success) {
      errors = answer.error.issues.map((issue) => issue.message);
      continue;
    }
    if (answer.data.action === 'cancel')
      return { conversationStatus: 'cancelled' };
    const analysis = await resolveApiSelectionAnswers({
      catalog: state.catalog,
      analysis: state.selectionAnalysis,
      answers: answer.data.answers,
    });
    return {
      selectionAnalysis: analysis,
      selection: analysis.selection,
      conversationStatus: analysis.questions.length
        ? 'awaiting-input'
        : 'working',
    };
  }
}
