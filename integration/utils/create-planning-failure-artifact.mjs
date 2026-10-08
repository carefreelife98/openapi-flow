import {
  ReviewableWorkflowGraphPlanningError,
  WorkflowGraphPlanningError,
} from '@openapi-flow/langchain';

/** Keep application-owned validation evidence, never transport requests/headers. */
export function createPlanningFailureArtifact(error) {
  if (
    error instanceof ReviewableWorkflowGraphPlanningError ||
    error instanceof WorkflowGraphPlanningError
  ) {
    return {
      kind: 'planning-validation',
      name: error.name,
      stage: error.failure.stage,
      message: error.message,
      cause: { name: error.cause.name, message: error.cause.message },
      output: error.failure.output,
    };
  }
  return {
    kind: 'unclassified',
    name: error instanceof Error ? error.name : typeof error,
  };
}
