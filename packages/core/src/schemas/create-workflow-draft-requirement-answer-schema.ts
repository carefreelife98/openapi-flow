import { z } from 'zod';
import type {
  WorkflowDraftRequirementEditDescription,
  WorkflowDraftRequirementAnswer,
} from '../types/workflow-draft-requirement-edit.js';
import { workflowDraftRequirementSchema } from './workflow-draft-schema.js';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';
import { createWorkflowDraftSelectedScopeSchema } from './create-workflow-draft-selected-scope-schema.js';

/** UI schema only; mutation boundaries re-derive selected identities from the original plan. */
export function createWorkflowDraftRequirementAnswerSchema(
  description: WorkflowDraftRequirementEditDescription,
): z.ZodType<WorkflowDraftRequirementAnswer> {
  return z.strictObject({
    answerMessageId: planningEvidenceTextSchema.describe(
      'The explicit submitted human action ID; distinct from existing evidence IDs.',
    ),
    text: workflowDraftRequirementSchema.shape.text.describe(
      'The requirement statement explicitly confirmed by the human.',
    ),
    state: workflowDraftRequirementSchema.shape.state.describe(
      'The human-selected confirmation or deferral state; never execution readiness.',
    ),
    scope: createWorkflowDraftSelectedScopeSchema(
      description.nodes.map((node) => node.id),
    ).describe(
      'The whole workflow or actual selected API/native identities; pending values do not remove identities.',
    ),
  });
}
