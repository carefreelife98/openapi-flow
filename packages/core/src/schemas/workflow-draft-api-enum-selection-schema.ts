import { z } from 'zod';
import type {
  WorkflowDraftApiEnumChoicesInput,
  WorkflowDraftApiEnumSelectionProposal,
} from '../types/workflow-draft-api-enum-selection.js';
import { describeWorkflowDraftApiEnumChoices } from '../draft/edits/api/describe-workflow-draft-api-enum-choices.js';
import { createWorkflowDraftApiEnumChoiceSchema } from './workflow-draft-api-enum-choice-schema.js';

/** The model selects IDs and explains intent; there is deliberately no value field. */
export function createWorkflowDraftApiEnumSelectionSchema(
  input: WorkflowDraftApiEnumChoicesInput,
): z.ZodType<WorkflowDraftApiEnumSelectionProposal> {
  const { candidates } = describeWorkflowDraftApiEnumChoices(input);
  if (!candidates.length)
    return z.strictObject({ selections: z.array(z.never()).max(0) });
  return z.strictObject({
    selections: z
      .array(
        createWorkflowDraftApiEnumChoiceSchema(
          candidates,
          input.context.messages.map((message) => message.id),
        ),
      )
      .describe(
        'Select only when the human request identifies the meaning. Empty means no supported interpretation; keep the existing input question. Never select a default just because it exists.',
      ),
  });
}
