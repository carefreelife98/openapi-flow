import type { ReviewableWorkflowGraphPlanningFailure } from '../types/reviewable-workflow-planning.js';
import { OpenApiFlowError } from '@openapi-flow/core';

export class ReviewableWorkflowGraphPlanningError extends OpenApiFlowError {
  readonly failure: ReviewableWorkflowGraphPlanningFailure;

  constructor(failure: ReviewableWorkflowGraphPlanningFailure, cause: Error) {
    super({
      message: `model reviewable workflow graph ${failure.stage} failed: ${cause.message}`,
      diagnostic: {
        owner: 'langchain',
        operation: 'planReviewableWorkflowGraph',
        stage: 'planning',
        code: 'REVIEWABLE_WORKFLOW_GRAPH_PLANNING_FAILED',
      },
      cause,
    });
    this.name = 'ReviewableWorkflowGraphPlanningError';
    this.failure = failure;
  }
}
