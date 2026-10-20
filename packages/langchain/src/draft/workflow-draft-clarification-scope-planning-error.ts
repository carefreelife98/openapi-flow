import type { WorkflowDraftClarificationScopePlanningFailure } from '../types/workflow-draft-clarification.js';

export class WorkflowDraftClarificationScopePlanningError extends Error {
  readonly failure: WorkflowDraftClarificationScopePlanningFailure;
  constructor(
    failure: WorkflowDraftClarificationScopePlanningFailure,
    cause: Error,
  ) {
    super(
      `Workflow clarification scope planning failed at ${failure.stage}: ${cause.message}`,
      { cause },
    );
    this.name = 'WorkflowDraftClarificationScopePlanningError';
    this.failure = failure;
  }
}
