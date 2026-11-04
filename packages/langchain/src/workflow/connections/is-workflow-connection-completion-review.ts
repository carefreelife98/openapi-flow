import type { WorkflowConnectionStepDescription } from '@openapi-flow/core';

/** Code owns the stage transition. A structurally finished graph needs a fresh fixed-material review. */
export function isWorkflowConnectionCompletionReview(
  description: WorkflowConnectionStepDescription,
): boolean {
  const inspection = description.inspection;
  const semantic = new Set(inspection.semanticAssessmentGoalIds);
  return (
    semantic.size > 0 &&
    inspection.violations.length === 0 &&
    inspection.openBoundaries.length === 0 &&
    inspection.pendingNodeIds.length === 0 &&
    !inspection.unmetGoalIds.some((id) => !semantic.has(id))
  );
}
