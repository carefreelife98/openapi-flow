import type { ResolveApiOperationChoiceAnswerInput } from '../../types/api-clarification.js';
import type {
  ApiOperationKey,
  SelectedApiOperation,
} from '../../types/api-catalog.js';
import { apiOperationAnswersSchema } from '../../schemas/api-operation-answers-schema.js';
import { validateApiSelectionQuestion } from './validate-api-selection-question.js';
import { apiOperationKeyEquals } from '../catalog/api-operation-key-equals.js';

/** Resolve only the explicitly declared choice mode; prose never determines cardinality. */
export function resolveApiOperationChoiceAnswer(
  input: ResolveApiOperationChoiceAnswerInput,
): SelectedApiOperation[] {
  const { question } = input;
  validateApiSelectionQuestion(question);
  const answer = apiOperationAnswersSchema.element.parse(input.answer);
  if (answer.questionId !== question.id)
    throw new Error(
      `Operation answer questionId does not match ${question.id}`,
    );
  let keys: ApiOperationKey[];
  if (question.kind === 'operation-choice') {
    if (!('operation' in answer))
      throw new Error(
        `Operation question ${question.id} requires one operation`,
      );
    keys = [answer.operation];
  } else if (question.kind === 'operation-multiple-choice') {
    if (!('operations' in answer))
      throw new Error(
        `Operation question ${question.id} requires an operations array`,
      );
    keys = answer.operations;
    if (
      keys.length < question.minSelections ||
      keys.length > question.maxSelections
    )
      throw new Error(
        `Operation question ${question.id} requires ${question.minSelections}..${question.maxSelections} selections`,
      );
  } else {
    throw new Error(
      'Operation question has no supported source-owned choice kind',
    );
  }
  const seen: ApiOperationKey[] = [];
  return keys.map((key) => {
    if (seen.some((previous) => apiOperationKeyEquals(previous, key)))
      throw new Error(
        `Operation answer ${question.id} contains a duplicate selection`,
      );
    const candidate = question.candidates.find((item) =>
      apiOperationKeyEquals(item.key, key),
    );
    if (!candidate)
      throw new Error(
        `Operation answer ${question.id} does not match a current offered candidate`,
      );
    seen.push(key);
    return { key: structuredClone(candidate.key), purpose: question.purpose };
  });
}
