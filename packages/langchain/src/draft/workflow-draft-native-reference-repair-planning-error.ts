import type { WorkflowDraftNativeReferenceRepairPlanningFailure } from '../types/workflow-draft-native-reference-repair.js';

export class WorkflowDraftNativeReferenceRepairPlanningError extends Error {
  readonly failure: WorkflowDraftNativeReferenceRepairPlanningFailure;
  constructor(
    failure: WorkflowDraftNativeReferenceRepairPlanningFailure,
    cause: Error,
  ) {
    super(
      `Draft native reference repair ${failure.stage} failed: ${cause.message}`,
      { cause },
    );
    this.name = 'WorkflowDraftNativeReferenceRepairPlanningError';
    this.failure = structuredClone(failure);
  }
}
