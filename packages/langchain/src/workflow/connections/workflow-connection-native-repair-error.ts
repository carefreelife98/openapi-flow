import { OpenApiFlowError } from '@openapi-flow/core';
import type { WorkflowConnectionNativeRepairFailure } from '../../types/workflow-connection-native-repair.js';

export class WorkflowConnectionNativeRepairError extends OpenApiFlowError {
  readonly failure: WorkflowConnectionNativeRepairFailure;
  constructor(failure: WorkflowConnectionNativeRepairFailure, cause: Error) {
    super({
      message: cause.message,
      diagnostic: {
        owner: 'langchain',
        operation: failure.operation,
        stage: 'contract-validation',
        code: 'NATIVE_NODE_PLANNING_FAILED',
      },
      cause,
    });
    this.name = 'WorkflowConnectionNativeRepairError';
    this.failure = failure;
  }
}
