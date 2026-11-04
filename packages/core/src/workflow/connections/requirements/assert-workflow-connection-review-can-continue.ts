import type { WorkflowConnectionInspection } from '../../../types/workflow-connection-session.js';

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
    inspection.insufficientEvidenceGoalIds.length ||
    inspection.unmetGoalIds.some((id) =>
      inspection.semanticAssessmentGoalIds.includes(id),
    )
  )
    throw new WorkflowConnectionCompletionIncompleteError(inspection);
}
