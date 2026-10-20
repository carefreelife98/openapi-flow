import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowDraftClarification,
  describeWorkflowDraftClarificationOwnership,
  createWorkflowDraftApiInputEditValuesSchema,
  describeWorkflowDraftApiInputEdit,
  resolveWorkflowDraftApiInputEdits,
} from '@openapi-flow/core';
import type {
  WorkflowDraftApiInputEditResult,
  WorkflowDraftApiInputEditValues,
} from '@openapi-flow/core';
import type { GenerateWorkflowDraftApiInputEditsInput } from '../types/workflow-draft-api-input-edit.js';
import { workflowDraftApiInputEditValuesPrompt } from '../prompts/workflow-draft-api-input-edit-prompt.js';
import { WorkflowDraftApiInputEditPlanningError } from './workflow-draft-api-input-edit-planning-error.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { createWorkflowMessageEvidenceSelectionSchema } from '../schemas/create-workflow-message-evidence-selection-schema.js';
import type { WorkflowMessageSelectionOutput } from '../types/workflow-message-evidence-selection.js';

/** Only actual selected values. Removals require zero value-generation calls. */
export async function generateWorkflowDraftApiInputEdits(
  input: GenerateWorkflowDraftApiInputEditsInput,
): Promise<WorkflowDraftApiInputEditResult> {
  const described = describeWorkflowDraftApiInputEdit(input);
  const schema = createWorkflowDraftApiInputEditValuesSchema(
    input,
    createWorkflowMessageEvidenceSelectionSchema(described.messages),
  );
  const contract = structuredClone(input.contract);
  if (!contract.targets.some((target) => target.kind === 'set'))
    return resolveWorkflowDraftApiInputEdits({
      ...input,
      output: { values: {} },
    });
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'generateWorkflowDraftApiInputEdits.model must support structured output when set-values remain',
    );
  const output = await input.model
    .withStructuredOutput<
      WorkflowMessageSelectionOutput<WorkflowDraftApiInputEditValues>
    >(serializeStructuredOutputSchema(schema, 'draft-2020-12', 'input'), {
      name: 'generate_draft_api_input_edit_values',
      method: 'jsonSchema',
      strict: true,
    })
    .invoke([
      new SystemMessage(workflowDraftApiInputEditValuesPrompt),
      new HumanMessage(
        JSON.stringify({
          clarification: describeWorkflowDraftClarification(input.context),
          planningClarifications: describeWorkflowDraftClarificationOwnership({
            ...input,
            stepId: input.stepId,
            stage: 'api-arguments',
          }),
          instruction: described.instruction,
          messages: described.messages,
          targets: contract.targets.filter((target) => target.kind === 'set'),
          includeExplanations: described.includeExplanations,
        }),
      ),
    ]);
  try {
    const parsed = parseStructuredOutput(
      schema,
      output,
      'draft API input edit values',
    );
    const result = resolveWorkflowDraftApiInputEdits({
      ...input,
      output: parsed,
    });
    if (
      JSON.stringify(input.contract) !== JSON.stringify(contract) ||
      JSON.stringify(describeWorkflowDraftApiInputEdit(input)) !==
        JSON.stringify(described)
    )
      throw new Error(
        'Draft API input edit source changed during value generation; no automatic rebase',
      );
    return result;
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftApiInputEditPlanningError(
      { stage: 'values', output },
      cause,
    );
  }
}
