import type {
  ResolveApiSelectionAnswersInput,
  ApiSelectionAnalysis,
} from '../../types/api-clarification.js';
import { apiOperationAnswersSchema } from '../../schemas/api-operation-answers-schema.js';
import { resolveApiOperationChoiceAnswer } from './resolve-api-operation-choice-answer.js';
import { resolveApiOperations } from '../resolve-api-operations.js';

export async function resolveApiSelectionAnswers(
  input: ResolveApiSelectionAnswersInput,
): Promise<ApiSelectionAnalysis> {
  const answers = apiOperationAnswersSchema.parse(input.answers);
  await resolveApiOperations(input.catalog, [
    ...input.analysis.selection.operations.map((item) => item.key),
    ...input.analysis.questions.flatMap((question) =>
      question.candidates.map((candidate) => candidate.key),
    ),
  ]);
  const operations = structuredClone(input.analysis.selection.operations);
  const answered = new Set<string>();
  for (const answer of answers) {
    const question = input.analysis.questions.find(
      (item) => item.id === answer.questionId,
    );
    if (!question || answered.has(answer.questionId))
      throw new Error(
        `Unknown or duplicate operation question ${answer.questionId}`,
      );
    operations.push(...resolveApiOperationChoiceAnswer({ question, answer }));
    answered.add(question.id);
  }
  return {
    selection: {
      operations,
      gaps: structuredClone(input.analysis.selection.gaps),
    },
    questions: input.analysis.questions.filter(
      (question) => !answered.has(question.id),
    ),
  };
}
