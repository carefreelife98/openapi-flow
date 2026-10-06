import type { WorkflowGraphPlanningFailure } from '../types/workflow-planning.js';

export class WorkflowGraphPlanningError extends Error {
  readonly failure: WorkflowGraphPlanningFailure;

  constructor(failure: WorkflowGraphPlanningFailure, cause: Error) {
    super(`model workflow graph ${failure.stage} failed: ${cause.message}`, {
      cause,
    });
    this.name = 'WorkflowGraphPlanningError';
    this.failure = failure;
  }
}
