import { createHash } from 'node:crypto';
import type { WorkflowPlanEdge } from '../../../types/workflow-plan.js';
import type { WorkflowConnectionWorkingGraph } from '../../../types/workflow-connection-session.js';

/** Array ordering and explanation wording are not progress in an execution graph. */
export function connectionGraphFingerprint(
  graph: WorkflowConnectionWorkingGraph,
): string {
  return connectionValueFingerprint({
    edges: graph.edges.map(workflowConnectionEdgeId).sort(),
    roots: [...graph.rootNodeIds].sort(),
    terminals: graph.terminals
      .map((item) => JSON.stringify([item.nodeId, item.output]))
      .sort(),
    assessments: graph.assessments
      .map((item) =>
        JSON.stringify([item.goalId, item.satisfied, [...item.nodeIds].sort()]),
      )
      .sort(),
  });
}

export function connectionValueFingerprint(value: object): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function workflowConnectionEdgeId(edge: WorkflowPlanEdge): string {
  return connectionValueFingerprint([
    edge.from,
    edge.output,
    edge.to,
    edge.input,
  ]);
}
