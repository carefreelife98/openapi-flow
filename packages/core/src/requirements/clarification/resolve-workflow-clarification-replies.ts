import { isDeepStrictEqual } from 'node:util';
import type {
  ResolveWorkflowClarificationRepliesInput,
  WorkflowClarificationResolution,
} from '../../types/workflow-clarification.js';
import { workflowClarificationRepliesSchema } from '../../schemas/workflow-clarification-reply-schema.js';
import { buildWorkflowClarificationResolution } from './build-workflow-clarification-resolution.js';
import { validateWorkflowClarificationRound } from './validate-workflow-clarification-round.js';

/** Retain confirmed answers across partial replies; stale/modified state fails. */
export function resolveWorkflowClarificationReplies(
  input: ResolveWorkflowClarificationRepliesInput,
): WorkflowClarificationResolution {
  validateWorkflowClarificationRound(input);
  const replies = workflowClarificationRepliesSchema.parse(input.replies);
  if (input.previous !== undefined) {
    if (
      input.previous.roundId !== input.round.id ||
      input.previous.contextFingerprint !== input.round.contextFingerprint
    )
      throw new Error(
        'Previous clarification resolution belongs to a different round or planning context',
      );
    const expected = buildWorkflowClarificationResolution({
      round: input.round,
      replies: input.previous.replies,
    });
    if (!isDeepStrictEqual(expected, input.previous))
      throw new Error(
        'Previous clarification resolution has modified facts, answers or readiness',
      );
  }
  const combined = new Map(
    input.previous?.replies.map((reply) => [reply.questionId, reply]),
  );
  for (const reply of replies) {
    const previous = combined.get(reply.questionId);
    if (previous && previous.kind !== 'defer')
      throw new Error(
        `Clarification question ${reply.questionId} is already answered; start an explicit requirements revision to change it`,
      );
    combined.set(reply.questionId, reply);
  }
  return buildWorkflowClarificationResolution({
    round: input.round,
    replies: [...combined.values()],
  });
}
