import type {
  WorkflowPlanningDependency,
  WorkflowDependencyPathInput,
  WorkflowDependencyTraversalFrame,
} from '../../../types/workflow-planning-constraints.js';

/** Iterative traversal: graph depth must not depend on the JavaScript call stack. */
export function findWorkflowDependencyCycles(
  adjacency: Map<string, WorkflowPlanningDependency[]>,
): WorkflowPlanningDependency[][] {
  const completed = new Set<string>();
  const active = new Map<string, number>();
  const cycles: WorkflowPlanningDependency[][] = [];
  for (const nodeId of adjacency.keys()) {
    if (completed.has(nodeId)) continue;
    const stack: WorkflowDependencyTraversalFrame[] = [
      { nodeId, nextIndex: 0 },
    ];
    active.set(nodeId, 0);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edges = adjacency.get(frame.nodeId)!;
      if (frame.nextIndex === edges.length) {
        completed.add(frame.nodeId);
        active.delete(frame.nodeId);
        stack.pop();
        continue;
      }
      const edge = edges[frame.nextIndex++];
      const position = active.get(edge.to);
      if (position !== undefined) {
        cycles.push([
          ...stack.slice(position + 1).map((entry) => entry.incoming!),
          edge,
        ]);
      } else if (!completed.has(edge.to)) {
        active.set(edge.to, stack.length);
        stack.push({ nodeId: edge.to, nextIndex: 0, incoming: edge });
      }
    }
  }
  return cycles;
}

export function collectWorkflowDependencyParents(
  adjacency: Map<string, WorkflowPlanningDependency[]>,
  from: string,
): Map<string, WorkflowPlanningDependency> {
  const pending = [from];
  const visited = new Set([from]);
  const parents = new Map<string, WorkflowPlanningDependency>();
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const current = pending[cursor];
    for (const edge of adjacency.get(current)!) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      parents.set(edge.to, edge);
      pending.push(edge.to);
    }
  }
  return parents;
}

export function findWorkflowDependencyPath({
  parents,
  from,
  to,
}: WorkflowDependencyPathInput): WorkflowPlanningDependency[] {
  const path: WorkflowPlanningDependency[] = [];
  let node = to;
  while (node !== from) {
    const edge = parents.get(node);
    if (edge === undefined)
      throw new Error('Dependency path requires a reachable target');
    path.push(edge);
    node = edge.from;
  }
  return path.reverse();
}
