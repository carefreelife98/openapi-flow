import { OpenApiFlowError } from '@openapi-flow/core';
import type { ApiCallBindingPlanningFailure } from '../types/api-call-binding-rejection.js';

/** Preserve causes and private rejected output; inherited toJSON contains only diagnostics. */
export class ApiCallBindingPlanningError extends OpenApiFlowError {
  readonly sourceFingerprint: string;
  readonly output: unknown;
  readonly originalError: OpenApiFlowError;

  constructor(failure: ApiCallBindingPlanningFailure) {
    super({
      message: failure.error.message,
      diagnostic: failure.error.diagnostic,
      cause: failure.error.cause,
    });
    this.sourceFingerprint = failure.sourceFingerprint;
    this.output = failure.output;
    this.originalError = failure.error;
  }
}
