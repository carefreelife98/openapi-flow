import { OpenApiFlowError } from '../../../errors/openapi-flow-error.js';
import { workflowConnectionRevisionViolationsSchema } from '../../../schemas/workflow-connection-revision-schema.js';
import type { WorkflowConnectionViolation } from '../../../types/workflow-connection-session.js';

/** Private code-owned graph witnesses. The public diagnostic never serializes their contents. */
export class WorkflowConnectionRevisionError extends OpenApiFlowError {
  readonly violations: WorkflowConnectionViolation[];

  constructor(violations: WorkflowConnectionViolation[]) {
    const checked =
      workflowConnectionRevisionViolationsSchema.parse(violations);
    super({
      message: 'Revised connection candidate is invalid',
      diagnostic: {
        owner: 'core',
        operation: 'applyWorkflowConnectionRevision',
        stage: 'contract-validation',
        code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
      },
      cause: violations,
    });
    this.name = 'WorkflowConnectionRevisionError';
    this.violations = structuredClone(checked);
  }
}
