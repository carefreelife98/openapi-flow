import type {
  WorkflowDraftRequirementEditInput,
  WorkflowDraftRequirementEditDescription,
} from '../../types/workflow-draft-requirement-edit.js';
import { describeWorkflowDraftSelectedNodes } from '../edits/describe-workflow-draft-selected-nodes.js';
import { listRemovedWorkflowDraftRequirements } from './history/list-removed-workflow-draft-requirements.js';

/** Typed human answers choose a real final identity, without requiring its executable material. */
export function describeWorkflowDraftRequirementEdit(
  input: WorkflowDraftRequirementEditInput,
): WorkflowDraftRequirementEditDescription {
  const nodes = describeWorkflowDraftSelectedNodes(input);
  const step = input.plan.steps.find((entry) => entry.id === input.stepId);
  if (
    !step ||
    (step.decision.kind !== 'revise-requirement' &&
      step.decision.kind !== 'restore-requirement')
  )
    throw new Error(
      `Requirement edit ${input.stepId} must name a selected revise-requirement or restore-requirement step`,
    );
  const requirementId = step.decision.requirementId;
  const candidates =
    step.decision.kind === 'restore-requirement'
      ? listRemovedWorkflowDraftRequirements(input.draft)
      : input.draft.requirements;
  const requirement = candidates.find((entry) => entry.id === requirementId);
  if (!requirement)
    throw new Error(
      `Requirement edit ${input.stepId} has no original requirement ${requirementId}`,
    );
  return {
    action: step.decision.kind === 'restore-requirement' ? 'restore' : 'revise',
    planId: input.plan.id,
    baseRevision: input.plan.baseRevision,
    stepId: step.id,
    requirement: structuredClone(requirement),
    nodes,
  };
}
