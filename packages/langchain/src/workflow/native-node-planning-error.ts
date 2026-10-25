import type { NativeNodePlanningFailure } from '../types/native-node-planning.js';
import { OpenApiFlowError } from '@openapi-flow/core';

export class NativeNodePlanningError extends OpenApiFlowError {
  readonly failure: NativeNodePlanningFailure;
  constructor(failure: NativeNodePlanningFailure, cause: Error) {
    super({
      message: `Native node planning failed at ${failure.stage}: ${cause.message}`,
      diagnostic: {
        owner: 'langchain',
        operation: 'planNativeNodes',
        stage: 'planning',
        code: 'NATIVE_NODE_PLANNING_FAILED',
      },
      cause,
    });
    this.name = 'NativeNodePlanningError';
    this.failure = failure;
  }
}
