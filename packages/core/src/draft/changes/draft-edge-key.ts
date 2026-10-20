import type { WorkflowPlanEdge } from '../../types/workflow-plan.js';

export function draftEdgeKey(edge: WorkflowPlanEdge): string {
  return JSON.stringify([edge.from, edge.output, edge.to, edge.input]);
}
