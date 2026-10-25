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
      return {
        ...checked,
        unmetGoalIds,
        semanticAssessmentGoalIds: input.session.goals
          .filter((goal) => goal.decision.kind === 'semantic')
          .map((goal) => goal.id),
        ready:
          !checked.violations.length &&
          !checked.openBoundaries.length &&
          !checked.pendingNodeIds.length &&
          !unmetGoalIds.length,
      };
    },
  );
}
