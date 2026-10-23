import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowDraftClarification,
  describeWorkflowDraftClarificationOwnership,
  describeWorkflowDraftNativeParameterEdit,
  createWorkflowDraftNativeParameterEditValuesSchema,
  resolveWorkflowDraftNativeParameterEdits,
} from '@openapi-flow/core';
import type {
  WorkflowDraftNativeParameterEditValues,
  WorkflowDraftNativeParameterEditResult,
} from '@openapi-flow/core';
import type { GenerateWorkflowDraftNativeParameterEditsInput } from '../types/workflow-draft-native-parameter-edit.js';
import { workflowDraftNativeParameterEditValuesPrompt } from '../prompts/workflow-draft-native-parameter-edit-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { createWorkflowMessageEvidenceSelectionSchema } from '../schemas/create-workflow-message-evidence-selection-schema.js';
import type { WorkflowMessageSelectionOutput } from '../types/workflow-message-evidence-selection.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { WorkflowDraftNativeParameterEditPlanningError } from './workflow-draft-native-parameter-edit-planning-error.js';
import { describeNativeParameterEditSourceCandidates } from './describe-native-parameter-edit-source-candidates.js';

export async function generateWorkflowDraftNativeParameterEdits(
  input: GenerateWorkflowDraftNativeParameterEditsInput,
): Promise<WorkflowDraftNativeParameterEditResult> {
  const context = describeWorkflowDraftNativeParameterEdit(input);
  const schema = createWorkflowDraftNativeParameterEditValuesSchema(
    input,
    createWorkflowMessageEvidenceSelectionSchema(context.messages),
  );
  const originalContract = JSON.stringify(input.contract);
  if (!input.contract.targets.some((target) => target.kind === 'set'))
    return resolveWorkflowDraftNativeParameterEdits({
      ...input,
      output: { values: {} },
    });
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'generateWorkflowDraftNativeParameterEdits.model must support structured output for set values',
    );
  const output = await input.model
    .withStructuredOutput<
      WorkflowMessageSelectionOutput<WorkflowDraftNativeParameterEditValues>
    >(serializeStructuredOutputSchema(schema, 'draft-2020-12', 'input'), {
      name: 'generate_draft_native_parameter_edit_values',
      method: 'jsonSchema',
      strict: true,
    })
    .invoke([
      new SystemMessage(workflowDraftNativeParameterEditValuesPrompt),
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
          targets: input.contract.targets.filter(
            (target) => target.kind === 'set',
          ),
          sourceCandidates: describeNativeParameterEditSourceCandidates(
            context.sourceCandidates,
          ),
          messages: context.messages,
          exclusiveOutputSources: context.exclusiveOutputSources,
          includeExplanations: context.includeExplanations,
        }),
      ),
    ]);
  try {
    const parsed = parseStructuredOutput(
      schema,
      output,
      'draft native parameter edit values',
    );
    if (JSON.stringify(input.contract) !== originalContract)
      throw new Error(
        'Native parameter edit contract changed during generation; no automatic rebase',
      );
    return resolveWorkflowDraftNativeParameterEdits({
      ...input,
      output: parsed,
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftNativeParameterEditPlanningError(
      { stage: 'values', output },
      cause,
    );
  }
}
