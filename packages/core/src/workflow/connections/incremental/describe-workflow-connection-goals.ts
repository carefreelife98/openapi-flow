import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import type {
  WorkflowConnectionSessionSource,
  WorkflowConnectionGoalPlanningDescription,
} from '../../../types/workflow-connection-session.js';
import { describeConnectionSessionSource } from './describe-connection-session-source.js';

/** Goal interpretation needs roles and contracts, not runtime capabilities or whole OAS documents. */
export function describeWorkflowConnectionGoals(
  input: WorkflowConnectionSessionSource,
): WorkflowConnectionGoalPlanningDescription {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'describeWorkflowConnectionGoals',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const { source, fingerprint, apiOperations } =
        describeConnectionSessionSource(input);
      return {
        sourceFingerprint: fingerprint,
        context: structuredClone(source.context),
        apiOperations,
        requirements: structuredClone(input.requirements),
      };
    },
  );
}
