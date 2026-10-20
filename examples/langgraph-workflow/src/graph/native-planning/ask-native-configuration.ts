import { interrupt } from '@langchain/langgraph';
import { z } from 'zod';
import type {
  WorkflowState,
  WorkflowUpdate,
} from '../../types/workflow-graph.js';
import { createNativeConfigurationResponseSchema } from '../../schemas/native-planning-schema.js';

/** Persist the original question and source bundle; never turn a reply into a rewritten scenario. */
export function askNativeConfiguration(state: WorkflowState): WorkflowUpdate {
  if (
    !state.nativeSelection ||
    !state.nativeConfigurations ||
    !state.nativeReplyIssues ||
    state.nativePlanningStatus !== 'awaiting-input'
  )
    throw new Error(
      'Native clarification requires original selection, questions and issue storage',
    );
  const questions = state.nativeConfigurations.flatMap((task) =>
    task.result?.status === 'needs-clarification' ? [task.result] : [],
  );
  const schema = createNativeConfigurationResponseSchema(questions);
  const response = schema.safeParse(
    interrupt(
      {
        kind: 'native-configuration',
        questions,
        selectionId: state.nativeSelection.id,
        issues: state.nativeReplyIssues,
      },
      { responseSchema: z.toJSONSchema(schema) },
    ),
  );
  if (!response.success)
    return {
      nativeReplyIssues: response.error.issues.map((issue) => issue.message),
    };
  if (response.data.action === 'cancel')
    return { nativePlanningStatus: 'cancelled', activeNativeNodeId: undefined };
  const answer = response.data;
  return {
    nativeConfigurations: state.nativeConfigurations.map((task) =>
      task.result?.status === 'needs-clarification' &&
      task.result.id === answer.questionId
        ? {
            ...task,
            replies: [
              ...task.replies,
              { question: structuredClone(task.result), text: answer.text },
            ],
            result: undefined,
          }
        : task,
    ),
    nativeReplyIssues: [],
    nativePlanningStatus: 'working',
  };
}
