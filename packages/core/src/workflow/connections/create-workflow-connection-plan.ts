import type { CreateWorkflowConnectionPlanInput } from '../../types/workflow-connection-planning.js';
import type { ReviewableWorkflowGraphPlan } from '../../types/reviewable-workflow.js';
import { workflowConnectionProposalSchema } from '../../schemas/workflow-connection-planning-schema.js';
import { describeWorkflowConnectionPlanning } from './describe-workflow-connection-planning.js';
import { createReviewableWorkflowGraphPlan } from '../create-reviewable-workflow-graph-plan.js';

export function createWorkflowConnectionPlan(
  input: CreateWorkflowConnectionPlanInput,
): ReviewableWorkflowGraphPlan {
  const { input: snapshot } = describeWorkflowConnectionPlanning(input);
  const proposal = workflowConnectionProposalSchema.parse(input.proposal);
  return createReviewableWorkflowGraphPlan({
    ...snapshot,
    proposal: {
      ...proposal,
      nativeNodes: structuredClone(snapshot.nativeNodes),
      edges: [...structuredClone(snapshot.edges), ...proposal.edges],
    },
  });
}
