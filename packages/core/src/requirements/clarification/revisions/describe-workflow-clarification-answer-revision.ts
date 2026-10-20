import { createHash } from 'node:crypto';
import type { WorkflowPlanningContext } from '../../../types/planning-evidence.js';
import type { WorkflowClarificationAnswerRevisionDescription } from '../../../types/workflow-clarification-answer-revision.js';
import { describeWorkflowPlanningContext } from '../../../planning/evidence/describe-workflow-planning-context.js';

/** Describe only already-confirmed questions. Pending answers use the ordinary reply boundary. */
export function describeWorkflowClarificationAnswerRevision(
  context: WorkflowPlanningContext,
): WorkflowClarificationAnswerRevisionDescription {
  const description = describeWorkflowPlanningContext(context);
  const clarification = context.clarification;
  if (!clarification)
    throw new Error(
      'Clarification answer revision requires context.clarification',
    );
  const replies = clarification.resolution.replies.filter(
    (reply) => reply.kind !== 'defer',
  );
  return {
    fingerprint: createHash('sha256')
      .update(JSON.stringify([description, clarification]))
      .digest('hex'),
    roundId: clarification.round.id,
    questions: structuredClone(
      clarification.round.categories.flatMap((category) =>
        category.questions.filter((question) =>
          replies.some((reply) => reply.questionId === question.id),
        ),
      ),
    ),
    replies: structuredClone(replies),
  };
}
