import type { WorkflowDraftApiInputEditPlanningFailure } from '../types/workflow-draft-api-input-edit.js';

export class WorkflowDraftApiInputEditPlanningError extends Error {
  readonly failure: WorkflowDraftApiInputEditPlanningFailure;
  constructor(failure: WorkflowDraftApiInputEditPlanningFailure, cause: Error) {
    super(`Draft API input edit ${failure.stage} failed: ${cause.message}`, {
      cause,
    });
    this.name = 'WorkflowDraftApiInputEditPlanningError';
    this.failure = structuredClone(failure);
  }
}
