import type { WorkflowReviewSuggestionPlanningFailure } from '../types/workflow-review-suggestions.js';

export class WorkflowReviewSuggestionPlanningError extends Error {
  readonly failure: WorkflowReviewSuggestionPlanningFailure;
  constructor(failure: WorkflowReviewSuggestionPlanningFailure, cause: Error) {
    super(
      `Workflow review suggestions failed at ${failure.stage}: ${cause.message}`,
      { cause },
    );
    this.name = 'WorkflowReviewSuggestionPlanningError';
    this.failure = failure;
  }
}
