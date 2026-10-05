import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { validateWorkflowGraphPlan } from '@openapi-flow/core';
import type { WorkflowGraphPlan } from '@openapi-flow/core';
import { z } from 'zod';
import type { PlanWorkflowGraphInput } from '../types/workflow-planning.js';
import { createWorkflowGraphPlanSchema } from '../schemas/workflow-graph-plan-schema.js';
import { workflowGraphPrompt } from '../prompts/workflow-graph-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';

export async function planWorkflowGraph(
  input: PlanWorkflowGraphInput,
): Promise<WorkflowGraphPlan> {
  assertSelectionInput(input.scenario, input.model);
  const schema = createWorkflowGraphPlanSchema(input.capabilities);
  const output: WorkflowGraphPlan = await input.model
    .withStructuredOutput<WorkflowGraphPlan>(schema, {
      name: 'plan_workflow_graph',
      method: 'functionCalling',
      strict: true,
    })
    .invoke([
      new SystemMessage(workflowGraphPrompt),
      new HumanMessage(
        JSON.stringify({
          scenario: input.scenario,
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
            arguments: { callId: args.callId, values: args.values },
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
  const plan = parseStructuredOutput(schema, output, 'model workflow graph');
  if (!plan.gaps.length) validateWorkflowGraphPlan({ ...input, plan });
  return plan;
}
