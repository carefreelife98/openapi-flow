import type { WorkflowGraphPlanningFailure } from '../types/workflow-planning.js';
import { OpenApiFlowError } from '@openapi-flow/core';

export class WorkflowGraphPlanningError extends OpenApiFlowError {
  readonly failure: WorkflowGraphPlanningFailure;

  constructor(failure: WorkflowGraphPlanningFailure, cause: Error) {
    super({
      message: `model workflow graph ${failure.stage} failed: ${cause.message}`,
      diagnostic: {
        owner: 'langchain',
        operation: 'planWorkflowGraph',
        stage: 'planning',
        code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
      },
      cause,
    });
    this.name = 'WorkflowGraphPlanningError';
    this.failure = failure;
  }
}
