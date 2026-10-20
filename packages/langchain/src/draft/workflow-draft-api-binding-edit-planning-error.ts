import type { WorkflowDraftApiBindingEditPlanningFailure } from '../types/workflow-draft-api-binding-edit.js';

export class WorkflowDraftApiBindingEditPlanningError extends Error {
  readonly failure: WorkflowDraftApiBindingEditPlanningFailure;
  constructor(
    failure: WorkflowDraftApiBindingEditPlanningFailure,
    cause: Error,
  ) {
    super(`Draft API binding edit ${failure.stage} failed: ${cause.message}`, {
      cause,
    });
    this.name = 'WorkflowDraftApiBindingEditPlanningError';
    this.failure = structuredClone(failure);
  }
}
