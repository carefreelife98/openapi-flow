import { workflowConnectionDecisionSchema } from '@openapi-flow/core';
import type { ResolvedWorkflowConnectionOutput } from '../types/workflow-orchestration.js';
import type { ResolvedWorkflowConnectionSelection } from '../types/workflow-connection-selection.js';

/** Fill only context-fixed omissions, then separate reasons from executable edges. */
export function resolveWorkflowConnectionOutput(
  output: ResolvedWorkflowConnectionSelection,
  includeExplanations: boolean,
): ResolvedWorkflowConnectionOutput {
  const proposal = {
    edges: output.edges.map(({ from, output, to, input }) => ({
      from,
      output,
      to,
      input,
    })),
    additionalGaps: structuredClone(output.additionalGaps),
    blockedCalls:
      output.blockedCalls === undefined
        ? []
        : output.blockedCalls.map(({ callId, gapIds }) => ({
            callId,
            gapIds: structuredClone(gapIds),
          })),
  };
  if (!includeExplanations) return { proposal };
  const presentation = workflowConnectionDecisionSchema.safeParse({
    ...output,
    blockedCalls: output.blockedCalls === undefined ? [] : output.blockedCalls,
  });
  if (presentation.success) return { proposal, decision: presentation.data };
  return {
    proposal,
    explanationIssues: presentation.error.issues.map((issue) => ({
      path: issue.path.map((segment) =>
        typeof segment === 'symbol' ? String(segment) : segment,
      ),
      code: issue.code,
    })),
  };
}
