import { OpenApiFlowError } from '../../../errors/openapi-flow-error.js';
import { workflowPlanningConstraintInspectionSchema } from '../../../schemas/workflow-planning-constraint-schema.js';
import type { WorkflowPlanningConstraintInspection } from '../../../types/workflow-planning-constraints.js';

/** Private structured witnesses identify conflicting decisions, not which model decision is correct. */
export class WorkflowPlanningConstraintError extends OpenApiFlowError {
  readonly inspection: WorkflowPlanningConstraintInspection;

  constructor(inspection: WorkflowPlanningConstraintInspection) {
    const checked =
      workflowPlanningConstraintInspectionSchema.parse(inspection);
    if (!checked.conflicts.length)
      throw new Error('A planning constraint error requires actual conflicts');
    super({
      message: `Workflow planning constraints conflict: ${[...new Set(checked.conflicts.map((conflict) => conflict.code))].join(', ')}`,
      diagnostic: {
        owner: 'core',
        operation: 'inspectWorkflowPlanningConstraints',
        stage: 'contract-validation',
        code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
      },
    });
    this.name = 'WorkflowPlanningConstraintError';
    this.inspection = structuredClone(checked);
  }
}
