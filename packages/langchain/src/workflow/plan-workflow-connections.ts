import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createReviewableWorkflowGraphPlan } from '@openapi-flow/core';
import type {
  ReviewableWorkflowGraphPlan,
  ReviewableWorkflowGraphProposal,
} from '@openapi-flow/core';
import type { ReviewableWorkflowGraphOutput } from '../types/reviewable-workflow-planning.js';
import type { PlanWorkflowConnectionsInput } from '../types/workflow-orchestration.js';
import { createReviewableWorkflowGraphSchema } from '../schemas/reviewable-workflow-graph-schema.js';
import { completeReviewableWorkflowGraphProposal } from './complete-reviewable-workflow-graph-proposal.js';
import { workflowConnectionsPrompt } from '../prompts/workflow-connections-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { ReviewableWorkflowGraphPlanningError } from './reviewable-workflow-graph-planning-error.js';
import { prepareWorkflowConnectionMaterials } from './prepare-workflow-connection-materials.js';

export async function planWorkflowConnections(
  input: PlanWorkflowConnectionsInput,
): Promise<ReviewableWorkflowGraphPlan> {
  assertSelectionInput(input.scenario, input.model);
  const { materials, capabilities, nativeNodes, gaps, edges, contracts } =
    prepareWorkflowConnectionMaterials(input);
  const context = { materials, capabilities, gaps };
  const readyIds = materials.flatMap((material) =>
    material.status === 'ready' ? [material.arguments.callId] : [],
  );
  const schema = createReviewableWorkflowGraphSchema([], readyIds);
  const output: ReviewableWorkflowGraphOutput = await input.model
    .withStructuredOutput<ReviewableWorkflowGraphOutput>(schema, {
      name: 'plan_workflow_connections',
      method: 'functionCalling',
      strict: true,
    })
    .invoke([
      new SystemMessage(workflowConnectionsPrompt),
      new HumanMessage(
        JSON.stringify({
          scenario: input.scenario,
          nodes: contracts,
          edges,
          gaps,
          readyCallIds: readyIds,
        }),
      ),
    ]);
  let proposal: ReviewableWorkflowGraphProposal;
  try {
    proposal = completeReviewableWorkflowGraphProposal(
      parseStructuredOutput(schema, output, 'model workflow connections'),
      0,
      readyIds.length,
    );
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new ReviewableWorkflowGraphPlanningError(
      { stage: 'proposal-schema', output },
      error,
    );
  }
  try {
    return createReviewableWorkflowGraphPlan({
      ...context,
      proposal: {
        ...proposal,
        nativeNodes,
        edges: [...edges, ...proposal.edges],
      },
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new ReviewableWorkflowGraphPlanningError(
      { stage: 'graph-validation', output },
      error,
    );
  }
}
