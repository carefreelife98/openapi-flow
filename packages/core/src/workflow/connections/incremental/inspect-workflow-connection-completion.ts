import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import type {
  WorkflowConnectionSessionInput,
  WorkflowConnectionInspection,
} from '../../../types/workflow-connection-session.js';
import { validateWorkflowConnectionSession } from './validate-workflow-connection-session.js';
import { inspectConnectionGraph } from './inspect-connection-graph.js';
import { inspectConnectionGoals } from './inspect-connection-goals.js';

export function inspectWorkflowConnectionCompletion(
  input: WorkflowConnectionSessionInput,
): WorkflowConnectionInspection {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'inspectWorkflowConnectionCompletion',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const { source } = validateWorkflowConnectionSession(input);
      const { routeStates, ...checked } = inspectConnectionGraph({
        contracts: source.context.nodes,
        graph: input.session,
        apiIds: new Set(source.context.readyCallIds),
      });
      const unmetGoalIds = inspectConnectionGoals(input.session, routeStates);
      const unassessedGoalIds = input.session.goals
        .filter(
          (goal) =>
            goal.decision.kind === 'semantic' &&
            !input.session.assessments.some((item) => item.goalId === goal.id),
        )
        .map((goal) => goal.id);
      const insufficientEvidenceGoalIds = input.session.assessments
        .filter((item) => item.status === 'insufficient-evidence')
        .map((item) => item.goalId);
      return {
        ...checked,
        unmetGoalIds,
        unassessedGoalIds,
        insufficientEvidenceGoalIds,
        semanticAssessmentGoalIds: input.session.goals
          .filter((goal) => goal.decision.kind === 'semantic')
          .map((goal) => goal.id),
        ready:
          !checked.violations.length &&
          !checked.openBoundaries.length &&
          !checked.pendingNodeIds.length &&
          !unmetGoalIds.length &&
          !unassessedGoalIds.length &&
          !insufficientEvidenceGoalIds.length,
      };
    },
  );
}
