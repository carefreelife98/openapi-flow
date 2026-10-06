import type { ReviewableWorkflowGraphPlanningFailure } from '../types/reviewable-workflow-planning.js';

export class ReviewableWorkflowGraphPlanningError extends Error {
  readonly failure: ReviewableWorkflowGraphPlanningFailure;

  constructor(failure: ReviewableWorkflowGraphPlanningFailure, cause: Error) {
    super(
      `model reviewable workflow graph ${failure.stage} failed: ${cause.message}`,
      { cause },
    );
    this.name = 'ReviewableWorkflowGraphPlanningError';
    this.failure = failure;
  }
}
