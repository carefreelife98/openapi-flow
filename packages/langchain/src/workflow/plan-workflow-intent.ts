import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { isDeepStrictEqual } from 'node:util';
import {
  createWorkflowIntentProposalSchema,
  workflowIntentInputSchema,
  resolveWorkflowIntent,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type {
  WorkflowIntentPlan,
  WorkflowIntentProposal,
} from '@openapi-flow/core';
import type { PlanWorkflowIntentInput } from '../types/workflow-intent.js';
import { workflowIntentPrompt } from '../prompts/workflow-intent-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { modelSignalSchema } from '../schemas/model-signal-schema.js';
import { invokeStructuredModel } from '../model/invoke-structured-model.js';

/** One semantic planning call; the host owns invocation order, checkpointing, human review and revision. */
export async function planWorkflowIntent(
  input: PlanWorkflowIntentInput,
): Promise<WorkflowIntentPlan> {
  const operation = 'planWorkflowIntent';
  const source = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation,
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      modelSignalSchema.parse(input.signal);
      return workflowIntentInputSchema.parse({
        scenario: input.scenario,
        messages: input.messages,
      });
    },
  );
  const proposal = await invokeStructuredModel<WorkflowIntentProposal>({
    model: input.model,
    operation,
    name: 'plan_workflow_intent',
    schema: serializeStructuredOutputSchema(
      createWorkflowIntentProposalSchema(source),
      'draft-2020-12',
    ),
    method: 'jsonSchema',
    strict: true,
    signal: input.signal,
    messages: [
      new SystemMessage(workflowIntentPrompt),
      new HumanMessage(JSON.stringify(source)),
    ],
  });
  return runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation,
      stage: 'contract-validation',
      code: 'WORKFLOW_GRAPH_PLANNING_FAILED',
    },
    () => {
      if (
        !isDeepStrictEqual(
          source,
          workflowIntentInputSchema.parse({
            scenario: input.scenario,
            messages: input.messages,
          }),
        )
      )
        throw new Error(
          'Workflow intent source changed during model invocation',
        );
      return resolveWorkflowIntent({ ...source, proposal });
    },
  );
}
