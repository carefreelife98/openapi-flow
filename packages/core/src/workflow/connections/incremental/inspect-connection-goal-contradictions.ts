import { connectionReaches } from './inspect-connection-goals.js';
import type {
  WorkflowConnectionSession,
  WorkflowConnectionViolation,
} from '../../../types/workflow-connection-session.js';

/** An unfinished join/order is allowed; an existing forbidden dependency is not. */
export function inspectConnectionGoalContradictions(
  session: Pick<WorkflowConnectionSession, 'goals' | 'edges'>,
): WorkflowConnectionViolation[] {
  const violations: WorkflowConnectionViolation[] = [];
  for (const goal of session.goals) {
    if (goal.decision.kind !== 'independent') continue;
    const ids = goal.decision.nodeIds;
    for (const from of ids) {
      const to = ids.find(
        (to) => from !== to && connectionReaches(from, to, session.edges),
      );
      if (to === undefined) continue;
      violations.push({
        code: 'GOAL_CONTRADICTION',
        message: `Independent goal ${goal.id} forbids dependency path ${from} -> ${to}`,
        details: { kind: 'independence', goalId: goal.id, from, to },
      });
      break;
    }
  }
  return violations;
}
