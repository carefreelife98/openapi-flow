import type { WorkflowDraftApiCallPlanningFailure } from '../types/workflow-draft-api-call-planning.js';

export class WorkflowDraftApiCallPlanningError extends Error {
  readonly failure: WorkflowDraftApiCallPlanningFailure;
  constructor(failure: WorkflowDraftApiCallPlanningFailure, cause: Error) {
    super(`Draft API call ${failure.stage} planning failed: ${cause.message}`, {
      cause,
    });
    this.name = 'WorkflowDraftApiCallPlanningError';
    this.failure = failure;
  }
}
