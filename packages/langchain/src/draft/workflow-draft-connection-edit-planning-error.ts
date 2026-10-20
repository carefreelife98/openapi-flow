import type { WorkflowDraftConnectionEditPlanningFailure } from '../types/workflow-draft-connection-edit.js';

export class WorkflowDraftConnectionEditPlanningError extends Error {
  readonly failure: WorkflowDraftConnectionEditPlanningFailure;
  constructor(
    failure: WorkflowDraftConnectionEditPlanningFailure,
    cause: Error,
  ) {
    super(`Draft connection edit ${failure.stage} failed: ${cause.message}`, {
      cause,
    });
    this.name = 'WorkflowDraftConnectionEditPlanningError';
    this.failure = structuredClone(failure);
  }
}
