import type { WorkflowConnectionInspection } from '../../../types/workflow-connection-session.js';

export class WorkflowConnectionUnsupportedRequirementsError extends Error {
  readonly unsupportedGoalIds: string[];
  constructor(inspection: WorkflowConnectionInspection) {
    super(
      `Connection delivery has ${inspection.unsupportedGoalIds.length} unsupported requirements. Inspect the accepted session for independently runnable components and preserved drafts; do not repeat completion review.`,
    );
    this.name = 'WorkflowConnectionUnsupportedRequirementsError';
    this.unsupportedGoalIds = [...inspection.unsupportedGoalIds];
  }
}

/** A settled negative review needs new material or evidence, not another unchanged connection proposal. */
export class WorkflowConnectionCompletionIncompleteError extends Error {
  readonly violatedGoalIds: string[];
  readonly insufficientEvidenceGoalIds: string[];

  constructor(inspection: WorkflowConnectionInspection) {
    const violated = inspection.unmetGoalIds.filter((id) =>
      inspection.semanticAssessmentGoalIds.includes(id),
    );
    super(
      `Connection completion review is incomplete: ${violated.length} violated semantic goals; ${inspection.insufficientEvidenceGoalIds.length} goals need evidence. Replan the responsible material or supply the missing evidence before another review.`,
    );
    this.name = 'WorkflowConnectionCompletionIncompleteError';
    this.violatedGoalIds = violated;
    this.insufficientEvidenceGoalIds = [
      ...inspection.insufficientEvidenceGoalIds,
    ];
  }
}

export function assertWorkflowConnectionReviewCanContinue(
  inspection: WorkflowConnectionInspection,
): void {
  if (
    inspection.unsupportedGoalIds.length &&
    !inspection.violations.length &&
    !inspection.openBoundaries.length &&
    !inspection.pendingNodeIds.length &&
    !inspection.unassessedGoalIds.length
  )
    throw new WorkflowConnectionUnsupportedRequirementsError(inspection);
  if (
    inspection.insufficientEvidenceGoalIds.length ||
    inspection.unmetGoalIds.some((id) =>
      inspection.semanticAssessmentGoalIds.includes(id),
    )
  )
    throw new WorkflowConnectionCompletionIncompleteError(inspection);
}
