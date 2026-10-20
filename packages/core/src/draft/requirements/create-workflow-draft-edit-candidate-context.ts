import { isDeepStrictEqual } from 'node:util';
import type { WorkflowDraftContext } from '../../types/workflow-draft.js';
import type {
  WorkflowDraftEditCandidateContextInput,
  WorkflowDraftEditCandidateContext,
} from '../../types/workflow-draft-requirement-history.js';
import { workflowDraftEditResolutionSchema } from '../../schemas/workflow-draft-edit-assembly-schema.js';
import { validateWorkflowDraftEditPlan } from '../edits/validate-workflow-draft-edit-plan.js';
import { resolveWorkflowPlanningMessages } from '../../planning/evidence/resolve-workflow-planning-messages.js';
import { describeWorkflowDraftRequirementEdit } from './describe-workflow-draft-requirement-edit.js';
import { createWorkflowDraftRequirementAnswerSchema } from '../../schemas/create-workflow-draft-requirement-answer-schema.js';

/** Explicit typed human answers are audit evidence, never new semantic-plan or model-output authority. */
export function createWorkflowDraftEditCandidateContext<
  Context extends WorkflowDraftContext,
>(
  input: WorkflowDraftEditCandidateContextInput<Context>,
): WorkflowDraftEditCandidateContext<Context> {
  validateWorkflowDraftEditPlan(input);
  const resolutions = workflowDraftEditResolutionSchema
    .array()
    .parse(input.resolutions);
  const messages = structuredClone(input.context.messages);
  const answerIds = new Set<string>();
  for (const resolution of resolutions) {
    if (resolution.kind !== 'requirement') continue;
    const step = input.plan.steps.find(
      (entry) => entry.id === resolution.stepId,
    );
    if (
      !step ||
      (step.decision.kind !== 'revise-requirement' &&
        step.decision.kind !== 'restore-requirement')
    )
      throw new Error(
        `Requirement answer ${resolution.stepId} must name a selected revise-requirement or restore-requirement step`,
      );
    if (answerIds.has(resolution.answerMessageId))
      throw new Error(
        `Requirement answer message ID is repeated: ${resolution.answerMessageId}`,
      );
    createWorkflowDraftRequirementAnswerSchema(
      describeWorkflowDraftRequirementEdit({ ...input, stepId: step.id }),
    ).parse({
      answerMessageId: resolution.answerMessageId,
      text: resolution.text,
      state: resolution.state,
      scope: resolution.scope,
    });
    answerIds.add(resolution.answerMessageId);
    const message = {
      id: resolution.answerMessageId,
      text: JSON.stringify({
        kind: 'typed-requirement-answer',
        stepId: resolution.stepId,
        requirement: {
          text: resolution.text,
          state: resolution.state,
          scope: resolution.scope,
        },
      }),
    };
    const existing = messages.find((entry) => entry.id === message.id);
    if (existing && !isDeepStrictEqual(existing, message))
      throw new Error(
        `Requirement answer message ID conflicts with declared evidence: ${message.id}`,
      );
    if (!existing) messages.push(message);
  }
  return {
    ...input.context,
    messages,
    planningMessageIds: resolveWorkflowPlanningMessages(input.context).map(
      (message) => message.id,
    ),
  };
}
