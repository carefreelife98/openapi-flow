import { OpenApiFlowError } from '../../../errors/openapi-flow-error.js';
import type { WorkflowConnectionRegion } from '../../../types/workflow-connection-region.js';
import type { WorkflowConnectionViolation } from '../../../types/workflow-connection-session.js';

/** A parsed model region violates a declared planning rule; source/configuration failures stay distinct. */
export class WorkflowConnectionRegionValidationError extends OpenApiFlowError {
  readonly region: WorkflowConnectionRegion;
  readonly violations: WorkflowConnectionViolation[];

  constructor(
    region: WorkflowConnectionRegion,
    violation: WorkflowConnectionViolation,
  ) {
    super({
      message: violation.message,
      diagnostic: {
        owner: 'core',
        operation: 'deriveWorkflowConnectionRegionPatch',
        stage: 'input-validation',
        code: 'PLANNING_INPUT_INVALID',
      },
    });
    this.region = structuredClone(region);
    this.violations = structuredClone([violation]);
  }
}
