import { OpenApiFlowError, isOpenApiFlowError } from '@openapi-flow/core';
import type { ApiArgumentPlanningFailure } from '../types/argument-generation.js';

/** Preserve the original typed error and cause; inherited toJSON exposes only its safe diagnostic. */
export class ApiArgumentPlanningError extends OpenApiFlowError {
  readonly originalError: OpenApiFlowError;
  readonly sourceFingerprint: string;
  readonly output: unknown;

  constructor(failure: ApiArgumentPlanningFailure) {
    super({
      message: failure.error.message,
      diagnostic: failure.error.diagnostic,
      cause: failure.error.cause,
    });
    this.originalError = failure.error;
    this.sourceFingerprint = failure.sourceFingerprint;
    this.output = failure.output;
  }
}

/** Only this literal stage's output/contract rejection is eligible; transport/configuration/enum errors are not. */
export function rethrowApiArgumentPlanningError(
  error: unknown,
  sourceFingerprint: string,
  output: unknown,
): never {
  if (error instanceof ApiArgumentPlanningError) throw error;
  if (
    isOpenApiFlowError(error) &&
    error.diagnostic.owner === 'langchain' &&
    ((error.diagnostic.stage === 'model-output' &&
      error.diagnostic.code === 'MODEL_OUTPUT_INVALID' &&
      ['generateApiArguments', 'parseStructuredOutput'].includes(
        error.diagnostic.operation,
      )) ||
      (error.diagnostic.stage === 'contract-validation' &&
        error.diagnostic.code === 'API_ARGUMENT_VALIDATION_FAILED' &&
        error.diagnostic.operation === 'generateApiArguments'))
  )
    throw new ApiArgumentPlanningError({ error, sourceFingerprint, output });
  throw error;
}
