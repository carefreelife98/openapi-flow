import type { WorkflowDraftNativeNodeAdditionPlanningFailure } from '../types/workflow-draft-native-node-addition.js';

export class WorkflowDraftNativeNodeAdditionPlanningError extends Error {
  readonly failure: WorkflowDraftNativeNodeAdditionPlanningFailure;
  constructor(
    failure: WorkflowDraftNativeNodeAdditionPlanningFailure,
    cause: Error,
  ) {
    super(`Native node addition failed at ${failure.stage}: ${cause.message}`, {
      cause,
    });
    this.name = 'WorkflowDraftNativeNodeAdditionPlanningError';
    this.failure = failure;
  }
}
