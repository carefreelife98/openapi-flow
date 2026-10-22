import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeWorkflowDraftApiCallArguments,
  describeWorkflowDraftApiEnumChoices,
  createWorkflowDraftApiEnumSelectionSchema,
  resolveWorkflowDraftApiCallArguments,
} from '@openapi-flow/core';
import type {
  WorkflowDraftApiEnumSelectionProposal,
  WorkflowDraftApiCallArgumentsResult,
} from '@openapi-flow/core';
import type { SelectWorkflowDraftApiEnumsInput } from '../types/workflow-draft-api-call-planning.js';
import { workflowDraftApiEnumSelectionPrompt } from '../prompts/workflow-draft-api-enum-selection-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { WorkflowDraftApiCallPlanningError } from './workflow-draft-api-call-planning-error.js';

/** A second call only when actual missing OAS enum choices remain; never a repair retry. */
export async function selectWorkflowDraftApiEnums(
  input: SelectWorkflowDraftApiEnumsInput,
): Promise<WorkflowDraftApiCallArgumentsResult> {
  const original = resolveWorkflowDraftApiCallArguments(input);
  const { candidates, targets } = describeWorkflowDraftApiEnumChoices(input);
  if (!candidates.length) return original;
  const description = describeWorkflowDraftApiCallArguments(input);
  const schema = createWorkflowDraftApiEnumSelectionSchema(input);
  const output = await input.model
    .withStructuredOutput<WorkflowDraftApiEnumSelectionProposal>(
      serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      {
        name: 'select_draft_api_enum_choices',
        method: 'functionCalling',
        strict: false,
      },
    )
    .invoke([
      new SystemMessage(workflowDraftApiEnumSelectionPrompt),
      new HumanMessage(
        JSON.stringify({
          instruction: description.instruction,
          messages: description.messages,
          backgroundMessages: description.backgroundMessages,
          operation: {
            key: description.operation.key,
            method: description.operation.method,
            path: description.operation.path,
            description: description.operation.operation.description,
          },
          requestMediaType: description.requestMediaType,
          candidates,
          targets,
        }),
      ),
    ]);
  try {
    const proposal = parseStructuredOutput(
      schema,
      output,
      'draft API OAS enum choices',
    );
    return resolveWorkflowDraftApiCallArguments({
      ...input,
      enumSelections: proposal.selections,
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftApiCallPlanningError(
      { stage: 'enum-selection', output },
      cause,
    );
  }
}
