import type { ApiSelectionQuestion } from '../../types/api-clarification.js';
import { apiOperationChoiceBoundsSchema } from '../../schemas/api-operation-choice-bounds-schema.js';

export function validateApiSelectionQuestion(
  question: ApiSelectionQuestion,
): void {
  if (question.kind === 'operation-choice') return;
  if (question.kind !== 'operation-multiple-choice')
    throw new Error(
      'Operation question has no supported source-owned choice kind',
    );
  const bounds = apiOperationChoiceBoundsSchema.parse({
    minSelections: question.minSelections,
    maxSelections: question.maxSelections,
  });
  if (bounds.maxSelections > question.candidates.length)
    throw new Error(
      `Operation question ${question.id} maxSelections exceeds offered candidates`,
    );
}
