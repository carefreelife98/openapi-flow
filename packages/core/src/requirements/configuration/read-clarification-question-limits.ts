import type { ClarificationQuestionLimits } from '../../types/workflow-clarification.js';
import { clarificationQuestionLimitsSchema } from '../../schemas/workflow-clarification-settings-schema.js';

/** Read once at the host boundary; no process.env access or silent defaults. */
export function readClarificationQuestionLimits(
  environment: Record<string, string | undefined>,
): ClarificationQuestionLimits {
  function read(name: string): number {
    const value = environment[name];
    if (
      typeof value !== 'string' ||
      !/^[1-9][0-9]*$/.test(value) ||
      !Number.isSafeInteger(Number(value))
    )
      throw new Error(
        `${name} must be an explicitly configured positive safe integer`,
      );
    return Number(value);
  }
  return clarificationQuestionLimitsSchema.parse({
    maxCategories: read('OPENAPI_FLOW_CLARIFY_MAX_CATEGORIES'),
    maxQuestionsPerCategory: read(
      'OPENAPI_FLOW_CLARIFY_MAX_QUESTIONS_PER_CATEGORY',
    ),
    maxChoicesPerQuestion: read(
      'OPENAPI_FLOW_CLARIFY_MAX_CHOICES_PER_QUESTION',
    ),
    maxQuestionsPerRound: read('OPENAPI_FLOW_CLARIFY_MAX_QUESTIONS_PER_ROUND'),
  });
}
