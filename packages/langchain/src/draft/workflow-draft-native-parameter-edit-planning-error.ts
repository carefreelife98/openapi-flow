import type { WorkflowDraftNativeParameterEditPlanningFailure } from '../types/workflow-draft-native-parameter-edit.js';

export class WorkflowDraftNativeParameterEditPlanningError extends Error {
  readonly failure: WorkflowDraftNativeParameterEditPlanningFailure;
  constructor(
    failure: WorkflowDraftNativeParameterEditPlanningFailure,
    cause: Error,
  ) {
    super(
      `Draft native parameter edit ${failure.stage} failed: ${cause.message}`,
      { cause },
    );
    this.name = 'WorkflowDraftNativeParameterEditPlanningError';
    this.failure = structuredClone(failure);
  }
}
