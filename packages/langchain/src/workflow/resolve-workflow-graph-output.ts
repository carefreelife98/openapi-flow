import type {
  ExplainedWorkflowGraphOutput,
  WorkflowGraphModelOutput,
  ResolvedWorkflowGraphOutput,
} from '../types/workflow-planning.js';
import type {
  ExplainedReviewableWorkflowGraphOutput,
  ReviewableWorkflowGraphModelOutput,
} from '../types/reviewable-workflow-planning.js';
import type { WorkflowGraphPlanningAssessment } from '@openapi-flow/core';

function assessment(
  output: ExplainedWorkflowGraphOutput | ExplainedReviewableWorkflowGraphOutput,
): WorkflowGraphPlanningAssessment {
  return {
    reason: output.reason,
    nodes:
      output.additionalNativeNodes === undefined
        ? []
        : output.additionalNativeNodes.map((node) => ({
            nodeId: node.id,
            reason: node.reason,
          })),
    edges: structuredClone(output.edges),
    blockedCalls:
      'blockedCalls' in output && output.blockedCalls !== undefined
        ? structuredClone(output.blockedCalls)
        : [],
  };
}

/** Context-fixed empty choices are code-owned, never fallback for a missing required model field. */
export function resolveExecutableWorkflowGraphOutput(
  output: WorkflowGraphModelOutput,
  capabilityCount: number,
): ResolvedWorkflowGraphOutput {
  if (capabilityCount > 0 && output.additionalNativeNodes === undefined)
    throw new Error('model workflow graph.additionalNativeNodes is required');
  const nodes = capabilityCount === 0 ? [] : output.additionalNativeNodes!;
  return {
    proposal: {
      mode: 'executable',
      additionalNativeNodes: nodes.map(({ id, capability, parameters }) => ({
        id,
        capability,
        parameters,
      })),
      edges: output.edges.map(({ from, output, to, input }) => ({
        from,
        output,
        to,
        input,
      })),
      gaps: structuredClone(output.gaps),
    },
    ...('reason' in output ? { assessment: assessment(output) } : {}),
  };
}

export function resolveReviewableWorkflowGraphOutput(
  output: ReviewableWorkflowGraphModelOutput,
  capabilityCount: number,
  readyCallCount: number,
): ResolvedWorkflowGraphOutput {
  if (capabilityCount > 0 && output.additionalNativeNodes === undefined)
    throw new Error(
      'model reviewable workflow graph.additionalNativeNodes is required',
    );
  if (readyCallCount > 0 && output.blockedCalls === undefined)
    throw new Error('model reviewable workflow graph.blockedCalls is required');
  const nodes = capabilityCount === 0 ? [] : output.additionalNativeNodes!;
  const blocked = readyCallCount === 0 ? [] : output.blockedCalls!;
  return {
    proposal: {
      mode: 'reviewable',
      additionalNativeNodes: nodes.map(({ id, capability, parameters }) => ({
        id,
        capability,
        parameters,
      })),
      edges: output.edges.map(({ from, output, to, input }) => ({
        from,
        output,
        to,
        input,
      })),
      additionalGaps: structuredClone(output.additionalGaps),
      blockedCalls: blocked.map(({ callId, gapIds }) => ({
        callId,
        gapIds: structuredClone(gapIds),
      })),
    },
    ...('reason' in output ? { assessment: assessment(output) } : {}),
  };
}
