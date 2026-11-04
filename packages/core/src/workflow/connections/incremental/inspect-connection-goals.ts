import type { WorkflowConnectionSession } from '../../../types/workflow-connection-session.js';
import type { WorkflowConnectionEvidence } from '../../../types/workflow-connection-evidence.js';
import { pointerValue } from '../../../bindings/json-pointer.js';
import type {
  WorkflowPlanEdge,
  WorkflowTopologyRoutes,
} from '../../../types/workflow-plan.js';

export function connectionReaches(
  from: string,
  to: string,
  edges: WorkflowPlanEdge[],
): boolean {
  const pending = [from];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(
      ...edges.filter((edge) => edge.from === current).map((edge) => edge.to),
    );
  }
  return false;
}

/** Semantic receipts are model assessments, never labeled as deterministic proof. */
export function inspectConnectionGoals(
  session: WorkflowConnectionSession,
  routeStates: WorkflowTopologyRoutes,
  apiNodeIds: string[],
  evidence: WorkflowConnectionEvidence[],
): string[] {
  return session.goals
    .filter(({ id, decision }) => {
      if (decision.kind === 'material-shape') {
        const item = evidence.find(
          (entry) =>
            entry.nodeId === decision.nodeId &&
            entry.kind === decision.materialKind,
        );
        if (!item)
          throw new Error(
            `Material-shape goal ${id}: missing current ${decision.materialKind} evidence for ${decision.nodeId}`,
          );
        const value = pointerValue(item.value, decision.pointer);
        return (
          value === null ||
          typeof value !== 'object' ||
          Array.isArray(value) !== (decision.container === 'array') ||
          Object.keys(value).length !== decision.size
        );
      }
      if (decision.kind === 'material-value') {
        const item = evidence.find(
          (entry) =>
            entry.nodeId === decision.nodeId &&
            entry.kind === decision.materialKind,
        );
        if (!item)
          throw new Error(
            `Material-value goal ${id}: missing current ${decision.materialKind} evidence for ${decision.nodeId}`,
          );
        return pointerValue(item.value, decision.pointer) !== decision.expected;
      }
      if (decision.kind === 'unsupported') return true;
      if (decision.kind === 'operation-set')
        return (
          decision.nodeIds.length !== apiNodeIds.length ||
          apiNodeIds.some((nodeId) => !decision.nodeIds.includes(nodeId))
        );
      if (decision.kind === 'semantic')
        return session.assessments.some(
          (item) => item.goalId === id && item.status === 'violated',
        );
      if (decision.kind === 'independent')
        return decision.nodeIds.some((left) =>
          decision.nodeIds.some(
            (right) =>
              left !== right && connectionReaches(left, right, session.edges),
          ),
        );
      if (decision.kind === 'join')
        return decision.producerIds.some((producer) => {
          const routes = routeStates.get(decision.nodeId);
          return (
            routes === undefined ||
            routes.length === 0 ||
            routes.some((route) => !route.completed.has(producer))
          );
        });
      const before =
        decision.kind === 'route' ? decision.from : decision.before;
      const after = decision.kind === 'route' ? decision.to : decision.after;
      const routes = routeStates.get(after);
      return (
        routes === undefined ||
        routes.length === 0 ||
        routes.some(
          (route) =>
            !route.completed.has(before) ||
            (decision.kind === 'route' &&
              !route.traversedOutputs.get(before)?.has(decision.output)),
        )
      );
    })
    .map((goal) => goal.id);
}
