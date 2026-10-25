import { OpenApiFlowError } from '@openapi-flow/core';
import type { WorkflowConnectionPlanningFailure } from '../../types/incremental-connection-planning.js';

/** Raw output is retained for a private host diagnostic, not in the public error projection. */
export class WorkflowConnectionPlanningError extends OpenApiFlowError {
  readonly output: unknown;
  readonly sourceFingerprint: string | undefined;

  constructor(failure: WorkflowConnectionPlanningFailure, cause: unknown) {
    super({
      message: cause instanceof Error ? cause.message : failure.operation,
      diagnostic: {
        owner: 'langchain',
        operation: failure.operation,
        stage: failure.stage,
        code: failure.code,
      },
      cause,
    });
    this.output = failure.output;
    this.sourceFingerprint = failure.sourceFingerprint;
  }
}

export function validateConnectionProposal<Result>(
  failure: WorkflowConnectionPlanningFailure,
  execute: () => Result,
): Result {
  try {
    return execute();
  } catch (cause) {
    throw new WorkflowConnectionPlanningError(failure, cause);
  }
}
