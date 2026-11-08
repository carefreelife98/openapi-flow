import type { WorkflowConnectionGoalProposal } from '../../../types/workflow-connection-session.js';

/** Individual valid predicates must also agree on their shared material coordinate. */
export function validateMaterialGoalConsistency(
  goals: WorkflowConnectionGoalProposal[],
): void {
  const values = new Map<string, string>();
  const shapes = new Map<string, string>();
  for (const goal of goals) {
    if (goal.kind !== 'material-value' && goal.kind !== 'material-shape')
      continue;
    const coordinate = JSON.stringify([
      goal.nodeId,
      goal.materialKind,
      goal.pointer,
    ]);
    const scalar = goal.kind === 'material-value';
    const own = scalar ? values : shapes;
    const other = scalar ? shapes : values;
    const expected = scalar
      ? JSON.stringify(goal.expected)
      : JSON.stringify([goal.container, goal.size]);
    if (
      other.has(coordinate) ||
      (own.has(coordinate) && own.get(coordinate) !== expected)
    )
      throw new Error(
        `Workflow material goals contain conflicting exact values or shapes for ${goal.materialKind} ${goal.nodeId}${goal.pointer}`,
      );
    own.set(coordinate, expected);
  }
}
