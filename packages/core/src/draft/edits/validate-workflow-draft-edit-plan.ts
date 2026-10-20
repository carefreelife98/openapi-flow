import { isDeepStrictEqual } from 'node:util';
import type { ValidateWorkflowDraftEditPlanInput } from '../../types/workflow-draft-edit.js';
import { createWorkflowDraftEditPlan } from './create-workflow-draft-edit-plan.js';
import { workflowDraftEditPlanSchema } from '../../schemas/workflow-draft-edit-plan-schema.js';

/** A persisted proposal cannot silently rebase, alter stage ownership or allocate its own IDs. */
export function validateWorkflowDraftEditPlan(
  input: ValidateWorkflowDraftEditPlanInput,
): void {
  const envelope = workflowDraftEditPlanSchema.safeParse(input.plan);
  if (!envelope.success)
    throw new Error('Draft edit plan has invalid metadata or step fields', {
      cause: envelope.error,
    });
  const expected = createWorkflowDraftEditPlan({
    draft: input.draft,
    context: input.context,
    requestMessageIds: input.requestMessageIds,
    options: input.plan.options,
    proposal: { decisions: input.plan.steps.map((step) => step.decision) },
  });
  if (!isDeepStrictEqual(expected, input.plan))
    throw new Error(
      'Draft edit plan is stale or has modified identities, context, stages or decisions',
    );
}
