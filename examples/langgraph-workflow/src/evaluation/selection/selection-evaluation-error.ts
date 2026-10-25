import { z } from 'zod';
import { isOpenApiFlowError } from '@openapi-flow/core';
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
  if (isOpenApiFlowError(error)) {
    return {
      name,
      status: error.diagnostic.httpStatus ?? null,
      validationIssues:
        validation === null
          ? null
          : validation.issues.map((issue) => ({
              path: issue.path.map(String),
              message: issue.message,
            })),
      interrupt:
        validation === null &&
        (error.diagnostic.stage === 'model-invocation' ||
          error.diagnostic.stage === 'model-configuration'),
    };
  }
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
