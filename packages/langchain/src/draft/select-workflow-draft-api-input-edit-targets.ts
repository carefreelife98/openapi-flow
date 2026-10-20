import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowDraftClarification,
  describeWorkflowDraftClarificationOwnership,
  describeWorkflowDraftApiInputEdit,
  createWorkflowDraftApiInputEditProposalSchema,
  createWorkflowDraftApiInputEditContract,
} from '@openapi-flow/core';
import type {
  WorkflowDraftApiInputEditContract,
  WorkflowDraftApiInputEditProposal,
} from '@openapi-flow/core';
import type { SelectWorkflowDraftApiInputEditTargetsInput } from '../types/workflow-draft-api-input-edit.js';
import { workflowDraftApiInputEditTargetsPrompt } from '../prompts/workflow-draft-api-input-edit-prompt.js';
import { WorkflowDraftApiInputEditPlanningError } from './workflow-draft-api-input-edit-planning-error.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { createWorkflowMessageEvidenceSelectionSchema } from '../schemas/create-workflow-message-evidence-selection-schema.js';
import type { WorkflowMessageSelectionOutput } from '../types/workflow-message-evidence-selection.js';

/** One bounded field-selection call; caller may review before value generation. */
export async function selectWorkflowDraftApiInputEditTargets(
  input: SelectWorkflowDraftApiInputEditTargetsInput,
): Promise<WorkflowDraftApiInputEditContract> {
  const described = describeWorkflowDraftApiInputEdit(input);
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'selectWorkflowDraftApiInputEditTargets.model must support structured output',
    );
  const planId = input.plan.id;
  const schema = createWorkflowDraftApiInputEditProposalSchema(
    input.requestMessageIds,
    described.includeExplanations,
    createWorkflowMessageEvidenceSelectionSchema(described.messages),
  );
  const output = await input.model
    .withStructuredOutput<
      WorkflowMessageSelectionOutput<WorkflowDraftApiInputEditProposal>
    >(serializeStructuredOutputSchema(schema, 'draft-7', 'input'), {
      name: 'select_draft_api_input_edit_targets',
      method: 'jsonSchema',
      strict: true,
    })
    .invoke([
      new SystemMessage(workflowDraftApiInputEditTargetsPrompt),
      new HumanMessage(
        JSON.stringify({
          clarification: describeWorkflowDraftClarification(input.context),
          planningClarifications: describeWorkflowDraftClarificationOwnership({
            ...input,
            stepId: input.stepId,
            stage: 'api-arguments',
          }),
          instruction: described.instruction,
          values: described.call.values,
          bindings: described.call.bindings,
          requestSchema: described.requestSchema,
          messages: described.messages,
          includeExplanations: described.includeExplanations,
        }),
      ),
    ]);
  try {
    const proposal = parseStructuredOutput(
      schema,
      output,
      'draft API input edit targets',
    );
    const contract = createWorkflowDraftApiInputEditContract({
      ...input,
      proposal,
    });
    if (
      input.plan.id !== planId ||
      JSON.stringify(describeWorkflowDraftApiInputEdit(input)) !==
        JSON.stringify(described)
    )
      throw new Error(
        'Draft API input edit source changed during target selection; no automatic rebase',
      );
    return contract;
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftApiInputEditPlanningError(
      { stage: 'targets', output },
      cause,
    );
  }
}
