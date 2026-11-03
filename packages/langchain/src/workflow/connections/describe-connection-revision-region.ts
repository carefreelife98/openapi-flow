import type {
  WorkflowConnectionRevisionDescription,
  WorkflowConnectionRegionContext,
} from '@openapi-flow/core';

/** Removed nodes remain explicit deletion choices; source changes never silently delete graph state. */
export function describeConnectionRevisionRegion(
  description: WorkflowConnectionRevisionDescription,
): WorkflowConnectionRegionContext {
  const current = new Set(
    description.after.context.nodes.map((node) => node.id),
  );
  return {
    ...description.before,
    context: description.after.context,
    requirements: description.after.requirements,
    retiredNodes: description.before.context.nodes
      .filter((node) => !current.has(node.id))
      .map(({ id }) => ({ id })),
  };
}
