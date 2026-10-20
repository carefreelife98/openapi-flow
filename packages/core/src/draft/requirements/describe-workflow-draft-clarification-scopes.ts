import { createHash } from 'node:crypto';
import type {
  WorkflowDraftClarificationScopeInput,
  WorkflowDraftClarificationScopeDescription,
  WorkflowDraftClarificationRequirement,
} from '../../types/workflow-draft-clarification.js';
import { describeWorkflowDraftEditContext } from '../edits/describe-workflow-draft-edit-context.js';
import { validateWorkflowDraftEditPlan } from '../edits/validate-workflow-draft-edit-plan.js';
import { describeWorkflowDraftSelectedNodes } from '../edits/describe-workflow-draft-selected-nodes.js';

/** Facts and question states are code-owned; the remaining choice is their actual semantic scope. */
export function describeWorkflowDraftClarificationScopes(
  input: WorkflowDraftClarificationScopeInput,
): WorkflowDraftClarificationScopeDescription {
  validateWorkflowDraftEditPlan(input);
  const described = describeWorkflowDraftEditContext(input);
  const active = input.context.clarification;
  const clarification = described.planning.clarification;
  const requirements: WorkflowDraftClarificationRequirement[] = [];
  if (active && clarification && input.plan.status !== 'no-change') {
    for (const fact of clarification.facts) {
      const sourceMessageIds = [
        ...new Set(
          fact.sources.map((source) => {
            if (source.kind === 'message') return source.messageId;
            const index = active.resolution.replies.findIndex(
              (reply) => reply.questionId === source.questionId,
            );
            if (index < 0 || !active.answerMessages[index])
              throw new Error(
                `Clarified fact ${fact.id} requires its original reply evidence`,
              );
            return active.answerMessages[index].id;
          }),
        ),
      ];
      requirements.push({
        id: `requirement:${fact.id}`,
        text: fact.text,
        state: 'confirmed',
        sourceMessageIds,
        origin: {
          kind: 'clarification-fact',
          roundId: clarification.roundId,
          sourceId: fact.id,
        },
      });
    }
    for (const question of [
      ...clarification.pendingQuestions,
      ...clarification.deferredQuestions,
    ])
      requirements.push({
        id: `requirement:${question.id}`,
        text: question.message,
        state: active.resolution.deferredQuestionIds.includes(question.id)
          ? 'deferred'
          : 'needs-clarification',
        sourceMessageIds: active.round.sourceMessages.map(
          (message) => message.id,
        ),
        origin: {
          kind: 'clarification-question',
          roundId: clarification.roundId,
          sourceId: question.id,
        },
      });
  }
  const nodes = describeWorkflowDraftSelectedNodes(input);
  const fields = {
    requirements,
    nodes,
    messages: described.planning.messages.filter((message) =>
      described.requestMessageIds.includes(message.id),
    ),
    includeExplanations: input.plan.options.includeExplanations,
  };
  return {
    fingerprint: createHash('sha256')
      .update(
        JSON.stringify([input.plan.id, described.contextFingerprint, fields]),
      )
      .digest('hex'),
    ...fields,
  };
}
