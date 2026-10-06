import type {
  CreateWorkflowGraphPlanInput,
  WorkflowGraphPlan,
} from '../types/workflow-plan.js';
import { validateWorkflowGraphPlan } from './validate-workflow-graph-plan.js';

export function createWorkflowGraphPlan(
  input: CreateWorkflowGraphPlanInput,
): WorkflowGraphPlan {
  const incomingIds = new Set(input.proposal.edges.map((edge) => edge.to));
  const nodeIds = [
    ...input.materials.map((item) => item.arguments.callId),
    ...input.proposal.nativeNodes.map((item) => item.id),
  ];
  const plan: WorkflowGraphPlan = {
    ...input.proposal,
    starts: input.proposal.gaps.length
      ? []
      : nodeIds.filter((id) => !incomingIds.has(id)),
  };
  if (!plan.gaps.length) validateWorkflowGraphPlan({ ...input, plan });
  return plan;
}
