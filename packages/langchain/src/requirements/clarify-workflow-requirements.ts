import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  createWorkflowClarificationRound,
  describeWorkflowPlanningContext,
  resolveWorkflowClarificationOptions,
} from '@openapi-flow/core';
import type { WorkflowClarificationRound } from '@openapi-flow/core';
import type {
  ClarifyWorkflowRequirementsInput,
  WorkflowRequirementsModelOutput,
} from '../types/workflow-clarification.js';
import { createWorkflowRequirementsSchema } from '../schemas/workflow-requirements-schema.js';
import { serializeWorkflowRequirementsSchema } from '../schemas/serialize-workflow-requirements-schema.js';
import { workflowRequirementsPrompt } from '../prompts/workflow-requirements-prompt.js';
import { workflowUserActionEvidencePrompt } from '../prompts/workflow-user-action-evidence-prompt.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { resolveWorkflowRequirementsEvidence } from './resolve-workflow-requirements-evidence.js';
import type { WorkflowMessageSelectionOutput } from '../types/workflow-message-evidence-selection.js';

/** One bounded proposal call. Question IDs, sources and reply handling belong to core. */
export async function clarifyWorkflowRequirements(
  input: ClarifyWorkflowRequirementsInput,
): Promise<WorkflowClarificationRound> {
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'clarifyWorkflowRequirements.model must support structured output',
    );
  const context = describeWorkflowPlanningContext(input.context);
  if (input.backgroundMessages !== undefined) {
    if (!Array.isArray(input.backgroundMessages))
      throw new Error(
        'clarifyWorkflowRequirements.backgroundMessages must be an array',
      );
    if (input.backgroundMessages.length)
      describeWorkflowPlanningContext({ messages: input.backgroundMessages });
  }
  const options = resolveWorkflowClarificationOptions(input.options);
  const candidates = context.operations.map((operation, index) => ({
    candidateId: `candidate-${index + 1}`,
    operation,
  }));
  const schema = createWorkflowRequirementsSchema(
    input.limits,
    options,
    context,
    candidates,
  );
  const output = await input.model
    .withStructuredOutput<
      WorkflowMessageSelectionOutput<WorkflowRequirementsModelOutput>
    >(serializeWorkflowRequirementsSchema(schema), {
      name: 'clarify_workflow_requirements',
      method: 'jsonSchema',
      strict: true,
    })
    .invoke([
      new SystemMessage(
        workflowRequirementsPrompt + '\n' + workflowUserActionEvidencePrompt,
      ),
      new HumanMessage(
        JSON.stringify({
          messages: context.messages,
          ...(input.backgroundMessages === undefined
            ? {}
            : { backgroundMessages: input.backgroundMessages }),
          entrypoint: context.entrypoint,
          candidates,
          capabilities: context.capabilities,
          limits: input.limits,
          options,
        }),
      ),
    ]);
  const proposed = parseStructuredOutput(
    schema,
    output,
    'model workflow requirements',
  );
  return createWorkflowClarificationRound({
    context: input.context,
    limits: input.limits,
    options,
    proposal: resolveWorkflowRequirementsEvidence(proposed, candidates),
  });
}
