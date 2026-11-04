import type {
  WorkflowConnectionCompletionProposal,
  WorkflowConnectionWorkingGraph,
} from '../../../types/workflow-connection-session.js';

/** A scoped review updates its goals without erasing valid evidence owned by other scopes. */
export function applyConnectionAssessments(
  graph: WorkflowConnectionWorkingGraph,
  proposal: WorkflowConnectionCompletionProposal,
): WorkflowConnectionWorkingGraph {
  const assessments = new Map(
    graph.assessments.map((item) => [item.goalId, item]),
  );
  for (const item of proposal.assessments) assessments.set(item.goalId, item);
  return {
    ...structuredClone(graph),
    assessments: structuredClone([...assessments.values()]),
  };
}
