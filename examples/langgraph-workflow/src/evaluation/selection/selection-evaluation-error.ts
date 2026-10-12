import { z } from 'zod';
import type { SelectionEvaluationError } from '../../types/api-selection-evaluation.js';
import { evaluationTransportStatusSchema } from '../../schemas/api-selection-evaluation-schema.js';

export function selectionEvaluationError(
  error: unknown,
): SelectionEvaluationError {
  const status = evaluationTransportStatusSchema.safeParse(error);
  const validation =
    error instanceof z.ZodError
      ? error
      : error instanceof Error && error.cause instanceof z.ZodError
        ? error.cause
        : null;
  const name = error instanceof Error ? error.name : typeof error;
  return {
    name,
    status: status.success ? status.data.status : null,
    validationIssues:
      validation === null
        ? null
        : validation.issues.map((issue) => ({
            path: issue.path.map(String),
            message: issue.message,
          })),
    interrupt:
      status.success ||
      [
        'APIConnectionError',
        'APIConnectionTimeoutError',
        'TimeoutError',
        'AbortError',
      ].includes(name),
  };
}
