import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowDraftClarification,
  describeWorkflowDraftClarificationOwnership,
  describeWorkflowDraftNativeParameterEdit,
  createWorkflowDraftNativeParameterEditProposalSchema,
  resolveWorkflowDraftNativeParameterEditTargets,
} from '@openapi-flow/core';
import type {
  WorkflowDraftNativeParameterEditProposal,
  WorkflowDraftNativeParameterEditTargetsResult,
} from '@openapi-flow/core';
import type { SelectWorkflowDraftNativeParameterEditTargetsInput } from '../types/workflow-draft-native-parameter-edit.js';
import { workflowDraftNativeParameterEditTargetsPrompt } from '../prompts/workflow-draft-native-parameter-edit-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { createWorkflowMessageEvidenceSelectionSchema } from '../schemas/create-workflow-message-evidence-selection-schema.js';
import type { WorkflowMessageSelectionOutput } from '../types/workflow-message-evidence-selection.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { WorkflowDraftNativeParameterEditPlanningError } from './workflow-draft-native-parameter-edit-planning-error.js';

export async function selectWorkflowDraftNativeParameterEditTargets(
  input: SelectWorkflowDraftNativeParameterEditTargetsInput,
): Promise<WorkflowDraftNativeParameterEditTargetsResult> {
  const context = describeWorkflowDraftNativeParameterEdit(input);
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'selectWorkflowDraftNativeParameterEditTargets.model must support structured output',
    );
  const schema = createWorkflowDraftNativeParameterEditProposalSchema(
    context,
    createWorkflowMessageEvidenceSelectionSchema(context.messages),
  );
  const output = await input.model
    .withStructuredOutput<
      WorkflowMessageSelectionOutput<WorkflowDraftNativeParameterEditProposal>
    >(serializeStructuredOutputSchema(schema, 'draft-7', 'input'), {
      name: 'select_draft_native_parameter_edit_targets',
      method: 'jsonSchema',
      strict: true,
    })
    .invoke([
      new SystemMessage(workflowDraftNativeParameterEditTargetsPrompt),
      new HumanMessage(
        JSON.stringify({
          clarification: describeWorkflowDraftClarification(input.context),
          planningClarifications: describeWorkflowDraftClarificationOwnership({
            ...input,
            stepId: input.stepId,
            stage: 'native-parameters',
          }),
          instruction: context.instruction,
          capability: context.capability,
          parameters: context.node.parameters,
          runtimeParameters: context.node.runtimeParameters,
          parametersSchema: context.parametersSchema,
          messages: context.messages,
          backgroundMessages: context.backgroundMessages,
          includeExplanations: context.includeExplanations,
        }),
      ),
    ]);
  try {
    const proposal = parseStructuredOutput(
      schema,
      output,
      'draft native parameter edit targets',
    );
    return resolveWorkflowDraftNativeParameterEditTargets({
      ...input,
      fingerprint: context.fingerprint,
      proposal,
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftNativeParameterEditPlanningError(
      { stage: 'targets', output },
      cause,
    );
  }
}
