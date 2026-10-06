import type {
  CreateReviewableWorkflowGraphPlanInput,
  ReviewableWorkflowGraphPlan,
} from '../types/reviewable-workflow.js';
import { createReviewableNodeContracts } from './create-reviewable-node-contracts.js';
import { validateReviewableWorkflowGraphPlan } from './validate-reviewable-workflow-graph-plan.js';

export function createReviewableWorkflowGraphPlan(
  input: CreateReviewableWorkflowGraphPlanInput,
): ReviewableWorkflowGraphPlan {
  const { proposal, materials } = input;
  const plan: ReviewableWorkflowGraphPlan = {
    nativeNodes: proposal.nativeNodes,
    edges: proposal.edges,
    gaps: [
      ...input.gaps,
      ...proposal.additionalGaps.map((gap) => ({
        ...gap,
        stage: 'workflow-graph' as const,
      })),
    ],
    blockedCalls: [
      ...materials
        .filter((item) => item.status === 'blocked')
        .map((item) => ({ callId: item.callId, gapIds: item.gapIds })),
      ...proposal.blockedCalls,
    ],
    starts: [],
  };
  const incoming = new Set(plan.edges.map((edge) => edge.to));
  plan.starts = createReviewableNodeContracts({ ...input, plan })
    .filter((item) => !incoming.has(item.id))
    .map((item) => item.id);
  validateReviewableWorkflowGraphPlan({ ...input, plan });
  return plan;
}
