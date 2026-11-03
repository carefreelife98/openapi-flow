import type { WorkflowConnectionStepDescription } from '@openapi-flow/core';

/** Planning readiness ranks work; it never creates an execution edge or chooses business intent. */
export function countReadyConnectionInputs(
  step: WorkflowConnectionStepDescription,
  nodeIds: readonly string[],
): number {
  const pending = new Set(step.inspection.pendingNodeIds);
  return nodeIds.filter((id) => {
    if (!pending.has(id)) return false;
    const required = new Set(
      step.context.requiredPrecedence
        .filter((item) => item.after === id)
        .map((item) => item.before),
    );
    for (const edge of step.context.edges)
      if (edge.to === id) required.add(edge.from);
    for (const { decision } of step.goals) {
      if (decision.kind === 'precedence' && decision.after === id)
        required.add(decision.before);
      if (decision.kind === 'route' && decision.to === id)
        required.add(decision.from);
      if (decision.kind === 'join' && decision.nodeId === id)
        for (const producer of decision.producerIds) required.add(producer);
    }
    return [...required].every((producer) => !pending.has(producer));
  }).length;
}
