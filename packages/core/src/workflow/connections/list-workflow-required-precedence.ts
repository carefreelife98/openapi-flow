import type { WorkflowPlanNodeContract } from '../../types/workflow-plan.js';
import type { WorkflowRequiredPrecedence } from '../../types/workflow-required-precedence.js';

/** Required ordering, not direct edges, user intent or an inferred total order. */
export function listWorkflowRequiredPrecedence(
  nodes: WorkflowPlanNodeContract[],
): WorkflowRequiredPrecedence[] {
  const requirements: WorkflowRequiredPrecedence[] = [];
  for (const node of nodes) {
    for (const reference of node.references)
      requirements.push({
        before: reference.nodeId,
        after: node.id,
        kind: 'data-reference',
      });
    for (const [inputPort, references] of Object.entries(
      node.inputReferences ?? {},
    ))
      for (const reference of references)
        requirements.push({
          before: reference.nodeId,
          after: node.id,
          kind: 'data-reference',
          inputPort,
        });
    for (const before of node.dependencyNodeIds)
      requirements.push({
        before,
        after: node.id,
        kind: 'declared-dependency',
      });
  }
  return [
    ...new Map(
      requirements.map((requirement) => [
        JSON.stringify(requirement),
        requirement,
      ]),
    ).values(),
  ];
}
