import type { WorkflowConnectionPlanningContext } from '@openapi-flow/core';
import type { WorkflowConnectionSelectionOutput } from '../types/workflow-connection-selection.js';
import type { WorkflowConnectionPlanningOutput } from '../types/workflow-orchestration.js';
import { createReviewableWorkflowGraphSchema } from '../schemas/reviewable-workflow-graph-schema.js';

/** Resolve explicit new-gap references. Never repair, alias or approximate a supplied node ID. */
export function resolveWorkflowConnectionSelection(
  output: WorkflowConnectionSelectionOutput,
  context: WorkflowConnectionPlanningContext,
  includeExplanations: boolean,
): WorkflowConnectionPlanningOutput {
  const known = new Set(context.nodes.map((node) => node.id));
  const gaps = new Set(output.additionalGaps.map((gap) => gap.id));
  for (const edge of output.edges)
    for (const endpoint of [edge.from, edge.to]) {
      if (typeof endpoint === 'string') {
        if (!known.has(endpoint))
          throw new Error(
            'Connection selection references an unknown supplied node',
          );
      } else if (!gaps.has(endpoint.gapId) || known.has(endpoint.gapId)) {
        throw new Error(
          'Connection gap reference must name a newly declared gap, not a supplied node',
        );
      }
    }
  const canonical = {
    ...output,
    edges: output.edges.map((edge) => ({
      ...edge,
      from: typeof edge.from === 'string' ? edge.from : edge.from.gapId,
      to: typeof edge.to === 'string' ? edge.to : edge.to.gapId,
    })),
  };
  return createReviewableWorkflowGraphSchema(
    [],
    context.readyCallIds,
    includeExplanations ? 'connections' : 'none',
  ).parse(canonical);
}
