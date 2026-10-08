import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  createWorkflowGraphPlan,
  createNativeOutputContracts,
} from '@openapi-flow/core';
import type {
  WorkflowGraphPlan,
  WorkflowGraphProposal,
} from '@openapi-flow/core';
import { z } from 'zod';
import type { PlanWorkflowGraphInput } from '../types/workflow-planning.js';
import { createWorkflowGraphProposalSchema } from '../schemas/workflow-graph-proposal-schema.js';
import { WorkflowGraphPlanningError } from './workflow-graph-planning-error.js';
import { workflowGraphPrompt } from '../prompts/workflow-graph-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';

export async function planWorkflowGraph(
  input: PlanWorkflowGraphInput,
): Promise<WorkflowGraphPlan> {
  assertSelectionInput(input.scenario, input.model);
  const schema = createWorkflowGraphProposalSchema(input.capabilities);
  const preparedNativeNodes = input.preparedNativeNodes ?? [];
  const nativeOutputs = createNativeOutputContracts({
    nativeNodes: preparedNativeNodes,
    capabilities: input.capabilities,
  });
  const output: WorkflowGraphProposal = await input.model
    .withStructuredOutput<WorkflowGraphProposal>(schema, {
      name: 'plan_workflow_graph',
      method: 'functionCalling',
      strict: true,
    })
    .invoke([
      new SystemMessage(workflowGraphPrompt),
      new HumanMessage(
        JSON.stringify({
          scenario: input.scenario,
          preparedNativeNodes,
          nativeOutputs,
          // Request values are already generated. Avoid duplicating the resolved
          // response schemas through both operation and pathItem in this stage.
          materials: input.materials.map(({ operation, arguments: args }) => ({
            operation: {
              key: operation.key,
              method: operation.method,
              path: operation.path,
              operation: {
                summary: operation.operation.summary,
                description: operation.operation.description,
                tags: operation.operation.tags,
                responses: operation.operation.responses,
              },
            },
            arguments: {
              callId: args.callId,
              values: args.values,
              bindings: args.bindings,
            },
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
  let proposal: WorkflowGraphProposal;
  try {
    proposal = parseStructuredOutput(schema, output, 'model workflow graph');
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new WorkflowGraphPlanningError(
      { stage: 'proposal-schema', output },
      error,
    );
  }
  try {
    return createWorkflowGraphPlan({
      ...input,
      proposal: {
        ...proposal,
        nativeNodes: [...preparedNativeNodes, ...proposal.nativeNodes],
      },
    });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new WorkflowGraphPlanningError(
      { stage: 'graph-validation', output: proposal },
      error,
    );
  }
}
