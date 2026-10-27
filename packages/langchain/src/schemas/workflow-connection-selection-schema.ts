import { z } from 'zod';
import type { WorkflowConnectionPlanningContext } from '@openapi-flow/core';
import { createReviewableWorkflowGraphSchema } from './reviewable-workflow-graph-schema.js';
import { workflowConnectionReasonSchema } from './workflow-connection-explanation-schema.js';

/** Existing identities are supplied choices. Only new gap identities belong to the model. */
export function createWorkflowConnectionSelectionSchema(
  context: WorkflowConnectionPlanningContext,
  includeExplanations: boolean,
) {
  const nodeIds = context.nodes.map((node) => node.id);
  const additionalGap = z.strictObject({
    gapId: z
      .string()
      .min(1)
      .describe(
        'ID of a NEW gap declared in additionalGaps, not an existing node.',
      ),
  });
  const endpoint = nodeIds.length
    ? z.union([z.enum(nodeIds), additionalGap])
    : additionalGap;
  const outputs = [
    ...new Set(['main', ...context.nodes.flatMap((node) => node.outputs)]),
  ];
  const inputs = [
    ...new Set(['main', ...context.nodes.flatMap((node) => node.inputs)]),
  ];
  const base = createReviewableWorkflowGraphSchema(
    [],
    context.readyCallIds,
    includeExplanations ? 'connections' : 'none',
  );
  return base.extend({
    edges: z.array(
      z.strictObject({
        ...(includeExplanations
          ? { reason: workflowConnectionReasonSchema }
          : {}),
        from: endpoint.describe(
          'Choose an exact supplied source ID, or explicitly reference a new gap.',
        ),
        output: z.enum(outputs),
        to: endpoint.describe(
          'Choose an exact supplied target ID, or explicitly reference a new gap.',
        ),
        input: z.enum(inputs),
      }),
    ),
  });
}
