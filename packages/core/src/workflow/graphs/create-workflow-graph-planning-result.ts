import type { CreateWorkflowGraphPlanningResultInput } from '../../types/workflow-graph-planning.js';
import type { WorkflowGraphPlan } from '../../types/workflow-plan.js';
import type { ReviewableWorkflowGraphPlan } from '../../types/reviewable-workflow.js';
import { workflowGraphPlanningProposalSchema } from '../../schemas/workflow-graph-planning-schema.js';
import { describeWorkflowGraphPlanning } from './describe-workflow-graph-planning.js';
import { assembleNativeNodeMaterials } from '../planning/assemble-native-node-materials.js';
import { createWorkflowGraphPlan } from '../create-workflow-graph-plan.js';
import { createReviewableWorkflowGraphPlan } from '../create-reviewable-workflow-graph-plan.js';

export function createWorkflowGraphPlanningResult(
  input: CreateWorkflowGraphPlanningResultInput,
): WorkflowGraphPlan | ReviewableWorkflowGraphPlan {
  const { input: snapshot } = describeWorkflowGraphPlanning(input);
  const proposal = workflowGraphPlanningProposalSchema.parse(input.proposal);
  if (proposal.mode !== snapshot.mode)
    throw new Error(
      'graph proposal mode differs from its supplied planning mode',
    );
  const nativeNodes = assembleNativeNodeMaterials(
    snapshot.preparedNativeNodes,
    proposal.additionalNativeNodes,
  );
  if (proposal.mode === 'reviewable')
    return createReviewableWorkflowGraphPlan({
      ...snapshot,
      proposal: {
        nativeNodes,
        edges: proposal.edges,
        additionalGaps: proposal.additionalGaps,
        blockedCalls: proposal.blockedCalls,
      },
    });
  return createWorkflowGraphPlan({
    capabilities: snapshot.capabilities,
    materials: snapshot.materials.map((material) => {
      if (material.status !== 'ready')
        throw new Error('executable graph material must remain ready');
      return {
        operation: material.operation,
        arguments: material.arguments,
        ...(material.purpose === undefined
          ? {}
          : { purpose: material.purpose }),
      };
    }),
    proposal: { nativeNodes, edges: proposal.edges, gaps: proposal.gaps },
  });
}
