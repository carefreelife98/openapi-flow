import type {
  DescribeWorkflowDraftClarificationOwnershipInput,
  WorkflowDraftClarificationOwnership,
} from '../../../types/workflow-draft-clarification-ownership.js';
import { validateWorkflowDraftEditPlan } from '../validate-workflow-draft-edit-plan.js';
import { resolveWorkflowDraftClarificationOwnerIndex } from './resolve-workflow-draft-clarification-owner-index.js';
import { workflowDraftClarificationPlanningStageSchema } from '../../../schemas/workflow-draft-clarification-planning-stage-schema.js';

/** Retain every declared concern and code-resolve its stage owner; this is not an answer or readiness claim. */
export function describeWorkflowDraftClarificationOwnership(
  input: DescribeWorkflowDraftClarificationOwnershipInput,
): WorkflowDraftClarificationOwnership[] {
  validateWorkflowDraftEditPlan(input);
  const stage = workflowDraftClarificationPlanningStageSchema
    .optional()
    .safeParse(input.stage);
  if (!stage.success)
    throw new Error('Clarification ownership stage is invalid', {
      cause: stage.error,
    });
  if (
    input.stepId !== undefined &&
    !input.plan.steps.some((step) => step.id === input.stepId)
  )
    throw new Error(
      `Clarification ownership stepId ${input.stepId} must name an actual plan step`,
    );
  const decisions = input.plan.steps.map((step) => step.decision);
  const ownership: WorkflowDraftClarificationOwnership[] = [];
  input.plan.steps.forEach((step, index) => {
    const decision = step.decision;
    if (decision.kind !== 'needs-clarification') return;
    const targetIndex = resolveWorkflowDraftClarificationOwnerIndex({
      decisions,
      sourceIndex: index,
    });
    if (targetIndex === undefined) {
      if (decision.owner.kind !== 'semantic')
        throw new Error('A semantic clarification requires its explicit scope');
      if (
        input.stage === undefined &&
        (input.stepId === undefined || input.stepId === step.id)
      )
        ownership.push({
          sourceStepId: step.id,
          owner: structuredClone(decision.owner),
          instruction: decision.instruction,
          sources: structuredClone(decision.sources),
          ...(decision.explanation === undefined
            ? {}
            : { explanation: structuredClone(decision.explanation) }),
        });
      return;
    }
    const target = input.plan.steps[targetIndex];
    if (decision.owner.kind !== 'planning-step')
      throw new Error(
        'An owned clarification requires its explicit planning stage',
      );
    if (input.stage !== undefined && input.stage !== decision.owner.stage)
      return;
    if (
      input.stepId !== undefined &&
      input.stepId !== target.id &&
      input.stepId !== step.id
    )
      return;
    const nodeId =
      'nodeId' in target.decision ? target.decision.nodeId : target.newNodeId;
    ownership.push({
      sourceStepId: step.id,
      owner: {
        kind: 'planning-step',
        stepId: target.id,
        ...(nodeId === undefined ? {} : { nodeId }),
        stage: decision.owner.stage,
      },
      instruction: decision.instruction,
      sources: structuredClone(decision.sources),
      ...(decision.explanation === undefined
        ? {}
        : { explanation: structuredClone(decision.explanation) }),
    });
  });
  return ownership;
}
