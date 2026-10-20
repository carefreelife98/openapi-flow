import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { WorkflowPlanningContext } from '../../../types/planning-evidence.js';
import type {
  ReviseWorkflowClarificationAnswersInput,
  WorkflowClarificationAnswerRevision,
  WorkflowClarificationAnswerRevisionResult,
} from '../../../types/workflow-clarification-answer-revision.js';
import { workflowClarificationAnswerChangesSchema } from '../../../schemas/workflow-clarification-answer-revision-schema.js';
import { planningEvidenceTextSchema } from '../../../schemas/planning-evidence-schema.js';
import { describeWorkflowClarificationAnswerRevision } from './describe-workflow-clarification-answer-revision.js';
import { resolveWorkflowClarificationReplies } from '../resolve-workflow-clarification-replies.js';
import { prepareWorkflowDraftClarification } from '../prepare-workflow-draft-clarification.js';

/** Explicit, atomic answer replacement/reopening. No model call, guessed choice or in-place mutation. */
export function reviseWorkflowClarificationAnswers(
  input: ReviseWorkflowClarificationAnswersInput,
): WorkflowClarificationAnswerRevisionResult {
  const description = describeWorkflowClarificationAnswerRevision(
    input.context,
  );
  if (input.fingerprint !== description.fingerprint)
    throw new Error('Stale clarification answer revision fingerprint');
  const messageId = planningEvidenceTextSchema.parse(input.messageId);
  if (input.context.messages.some((message) => message.id === messageId))
    throw new Error(
      `Clarification revision message ID already exists: ${messageId}`,
    );
  const changes = workflowClarificationAnswerChangesSchema.parse(input.changes);
  const before = structuredClone(input.context.clarification!);
  const replies = new Map(
    before.resolution.replies.map((reply) => [reply.questionId, reply]),
  );
  for (const change of changes) {
    const questionId =
      change.kind === 'replace-answer'
        ? change.reply.questionId
        : change.questionId;
    if (!description.replies.some((reply) => reply.questionId === questionId))
      throw new Error(
        `Clarification revision requires a currently confirmed answer: ${questionId}`,
      );
    if (change.kind === 'reopen-question') replies.delete(questionId);
    else {
      if (isDeepStrictEqual(replies.get(questionId), change.reply))
        throw new Error(
          `Clarification answer change is a no-op: ${questionId}`,
        );
      replies.set(questionId, change.reply);
    }
  }
  const originalContext: WorkflowPlanningContext = {
    messages: before.round.sourceMessages,
    ...(input.context.operations === undefined
      ? {}
      : { operations: input.context.operations }),
    ...(input.context.capabilities === undefined
      ? {}
      : { capabilities: input.context.capabilities }),
    ...(input.context.entrypoint === undefined
      ? {}
      : { entrypoint: input.context.entrypoint }),
  };
  const after = prepareWorkflowDraftClarification({
    context: originalContext,
    round: before.round,
    resolution: resolveWorkflowClarificationReplies({
      context: originalContext,
      round: before.round,
      replies: [...replies.values()],
    }),
  });
  const supersededAnswerMessageIds = before.answerMessages
    .filter(
      (message) => !after.answerMessages.some((next) => next.id === message.id),
    )
    .map((message) => message.id);
  const message = {
    id: messageId,
    text: JSON.stringify({
      kind: 'explicit-clarification-answer-revision',
      roundId: before.round.id,
      fingerprint: description.fingerprint,
      changes,
    }),
  };
  const body = {
    fingerprint: description.fingerprint,
    message,
    changes,
    before,
    after,
    supersededAnswerMessageIds,
  };
  const revision: WorkflowClarificationAnswerRevision = {
    id:
      'clarification-answer-revision:' +
      createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    ...body,
  };
  const activeMessages = input.context.messages
    .filter((item) => !supersededAnswerMessageIds.includes(item.id))
    .map((item) => ({ ...item }));
  activeMessages.push(message);
  for (const receipt of after.answerMessages) {
    const existing = activeMessages.find((item) => item.id === receipt.id);
    if (existing && !isDeepStrictEqual(existing, receipt))
      throw new Error(
        `Clarification answer evidence conflicts with message ${receipt.id}`,
      );
    if (!existing) activeMessages.push(structuredClone(receipt));
  }
  return { revision, activeMessages };
}
