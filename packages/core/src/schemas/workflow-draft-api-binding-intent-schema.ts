import { z } from 'zod';
import type { WorkflowDraftApiCallPlanningInput } from '../types/workflow-draft-api-call-planning.js';
import type { WorkflowDraftApiBindingIntentProposal } from '../types/workflow-draft-api-binding-intent.js';
import { describeWorkflowDraftApiBindingIntent } from '../draft/edits/api/describe-workflow-draft-api-binding-intent.js';
import { createApiRequestInputPointerSchema } from './create-api-request-input-pointer-schema.js';
import { createWorkflowDraftSourceEvidenceFields } from './create-workflow-draft-source-evidence-fields.js';

export function createWorkflowDraftApiBindingIntentSchema(
  input: WorkflowDraftApiCallPlanningInput,
): z.ZodType<WorkflowDraftApiBindingIntentProposal> {
  const description = describeWorkflowDraftApiBindingIntent(input);
  // Conditional explanation fields use the same runtime-validated evidence contract.
  return z.strictObject({
    targets: z
      .array(createApiRequestInputPointerSchema(description.requestSchema))
      .describe(
        'Only inputs the user requests to obtain from preceding node results. Empty means no requested response-to-request dependency. OAS availability or requiredness alone is not dependency intent. Do not select unrelated optional filters, literal inputs, response assertions or control edges.',
      ),
    ...createWorkflowDraftSourceEvidenceFields(description),
  }) as z.ZodType<WorkflowDraftApiBindingIntentProposal>;
}
