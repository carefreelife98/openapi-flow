import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { createReviewableWorkflowGraphPlan } from '@openapi-flow/core';
import type {
  ReviewableWorkflowGraphPlan,
  ReviewableWorkflowGraphProposal,
} from '@openapi-flow/core';
import type {
  PlanReviewableWorkflowGraphInput,
  ReviewableWorkflowGraphOutput,
} from '../types/reviewable-workflow-planning.js';
import { completeReviewableWorkflowGraphProposal } from './complete-reviewable-workflow-graph-proposal.js';
import { createReviewableWorkflowGraphSchema } from '../schemas/reviewable-workflow-graph-schema.js';
import { reviewableWorkflowGraphPrompt } from '../prompts/reviewable-workflow-graph-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { ReviewableWorkflowGraphPlanningError } from './reviewable-workflow-graph-planning-error.js';

export async function planReviewableWorkflowGraph(
  input: PlanReviewableWorkflowGraphInput,
): Promise<ReviewableWorkflowGraphPlan> {
  assertSelectionInput(input.scenario, input.model);
  const readyIds = input.materials
    .filter((item) => item.status === 'ready')
    .map((item) => item.arguments.callId);
  const schema = createReviewableWorkflowGraphSchema(
    input.capabilities,
    readyIds,
  );
  const output: ReviewableWorkflowGraphOutput = await input.model
    .withStructuredOutput<ReviewableWorkflowGraphOutput>(schema, {
      name: 'plan_reviewable_workflow_graph',
      method: 'functionCalling',
      strict: true,
    })
    .invoke([
      new SystemMessage(reviewableWorkflowGraphPrompt),
      new HumanMessage(
        JSON.stringify({
          scenario: input.scenario,
          materials: input.materials.map(({ operation, ...material }) => ({
            ...material,
            operation: {
              key: operation.key,
              method: operation.method,
              path: operation.path,
              operation: {
                summary: operation.operation.summary,
                description: operation.operation.description,
                responses: operation.operation.responses,
              },
            },
            inputPorts: ['main'],
            outputPorts: ['main'],
          })),
          gaps: input.gaps.map((gap) => ({
            ...gap,
            inputPorts: ['main'],
            outputPorts: ['main'],
          })),
          capabilities: input.capabilities.map((capability) => ({
            name: capability.name,
            description: capability.description,
            parametersSchema: z.toJSONSchema(capability.parametersSchema),
            waitsForAllInputs: capability.waitsForAllInputs,
            exclusiveOutputPorts: capability.exclusiveOutputPorts,
          })),
        }),
      ),
    ]);
  let proposal: ReviewableWorkflowGraphProposal;
  try {
    proposal = completeReviewableWorkflowGraphProposal(
      parseStructuredOutput(schema, output, 'model reviewable workflow graph'),
      input.capabilities.length,
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
    return createReviewableWorkflowGraphPlan({ ...input, proposal });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new ReviewableWorkflowGraphPlanningError(
      { stage: 'graph-validation', output: proposal },
      error,
    );
  }
}
