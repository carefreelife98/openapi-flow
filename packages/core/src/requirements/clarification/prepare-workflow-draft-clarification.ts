import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type {
  PrepareWorkflowDraftClarificationInput,
  WorkflowDraftClarification,
} from '../../types/workflow-draft-clarification.js';
import { resolveWorkflowClarificationReplies } from './resolve-workflow-clarification-replies.js';

/** Re-derive facts and reply evidence from the original round. No summary text is promoted to a user's answer. */
export function prepareWorkflowDraftClarification(
  input: PrepareWorkflowDraftClarificationInput,
): WorkflowDraftClarification {
  if (input.context.clarification !== undefined)
    throw new Error(
      'prepareWorkflowDraftClarification.context must be the original question context, not a nested clarified context',
    );
  const resolution = resolveWorkflowClarificationReplies({
    round: input.round,
    context: input.context,
    replies: input.resolution.replies,
  });
  if (!isDeepStrictEqual(resolution, input.resolution))
    throw new Error(
      'Draft clarification resolution has modified facts, replies, provenance or readiness',
    );
  const questions = input.round.categories.flatMap(
    (category) => category.questions,
  );
  const answerMessages = resolution.replies.map((reply) => {
    const question = questions.find((item) => item.id === reply.questionId)!;
    const fact = resolution.facts.find((item) =>
      item.sources.some(
        (source) =>
          source.kind === 'clarification-answer' &&
          source.questionId === reply.questionId,
      ),
    );
    const text = JSON.stringify({
      kind: 'clarification-reply-evidence',
      roundId: input.round.id,
      questionId: question.id,
      question: question.message,
      reply,
      ...(fact === undefined ? {} : { confirmedFact: fact }),
    });
    return {
      id:
        'clarification-reply:' +
        createHash('sha256').update(text).digest('hex'),
      text,
    };
  });
  return {
    round: structuredClone(input.round),
    resolution,
    answerMessages,
    confirmedAnswerMessageIds: answerMessages
      .filter((_message, index) => resolution.replies[index].kind !== 'defer')
      .map((message) => message.id),
  };
}
