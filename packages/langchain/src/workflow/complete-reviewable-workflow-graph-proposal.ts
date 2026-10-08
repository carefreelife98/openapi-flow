import type { ReviewableWorkflowGraphProposal } from '@openapi-flow/core';
import type { ReviewableWorkflowGraphOutput } from '../types/reviewable-workflow-planning.js';

/** Complete only fields fixed by the supplied planning context, not model errors. */
export function completeReviewableWorkflowGraphProposal(
  output: ReviewableWorkflowGraphOutput,
  capabilityCount: number,
  readyCallCount: number,
): ReviewableWorkflowGraphProposal {
  if (capabilityCount > 0 && output.additionalNativeNodes === undefined)
    throw new Error(
      'model reviewable workflow graph.additionalNativeNodes is required',
    );
  if (readyCallCount > 0 && output.blockedCalls === undefined)
    throw new Error('model reviewable workflow graph.blockedCalls is required');
  const { additionalNativeNodes, ...proposal } = output;
  return {
    ...proposal,
    nativeNodes: capabilityCount === 0 ? [] : additionalNativeNodes!,
    blockedCalls: readyCallCount === 0 ? [] : output.blockedCalls!,
  };
}
