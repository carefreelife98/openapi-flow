import type { WorkflowDraftEditPlanningFailure } from '../types/workflow-draft-edit.js';

export class WorkflowDraftEditPlanningError extends Error {
  readonly failure: WorkflowDraftEditPlanningFailure;
  constructor(failure: WorkflowDraftEditPlanningFailure, cause: Error) {
    super(
      `Workflow draft edit analysis failed at ${failure.stage}: ${cause.message}`,
      { cause },
    );
    this.name = 'WorkflowDraftEditPlanningError';
    this.failure = failure;
  }
}
