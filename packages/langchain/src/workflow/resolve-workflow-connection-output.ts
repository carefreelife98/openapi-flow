import { projectWorkflowConnectionDecision } from '@openapi-flow/core';
import type {
  ResolvedWorkflowConnectionOutput,
  WorkflowConnectionPlanningOutput,
} from '../types/workflow-orchestration.js';
import { completeReviewableWorkflowGraphProposal } from './complete-reviewable-workflow-graph-proposal.js';

/** Fill only context-fixed omissions, then separate reasons from executable edges. */
export function resolveWorkflowConnectionOutput(
  output: WorkflowConnectionPlanningOutput,
  readyCallCount: number,
): ResolvedWorkflowConnectionOutput {
  const completed = completeReviewableWorkflowGraphProposal(
    output,
    0,
    readyCallCount,
  );
  if ('reason' in output) {
    const decision = {
      reason: output.reason,
      edges: output.edges,
      additionalGaps: output.additionalGaps,
      blockedCalls:
        output.blockedCalls === undefined ? [] : output.blockedCalls,
    };
    return { proposal: projectWorkflowConnectionDecision(decision), decision };
  }
  return {
    proposal: {
      edges: structuredClone(completed.edges),
      additionalGaps: structuredClone(completed.additionalGaps),
      blockedCalls: structuredClone(completed.blockedCalls),
    },
  };
}
