import { isDeepStrictEqual } from 'node:util';
import type { WorkflowPlanningContext } from '../../types/planning-evidence.js';
import type { WorkflowDraftClarificationDescription } from '../../types/workflow-draft-clarification.js';
import { prepareWorkflowDraftClarification } from './prepare-workflow-draft-clarification.js';

/** Validate against current declarations and original source messages, never client-edited facts or receipt text. */
export function describeWorkflowDraftClarification(
  context: WorkflowPlanningContext,
): WorkflowDraftClarificationDescription | undefined {
  const supplied = context.clarification;
  if (supplied === undefined) return undefined;
  if (
    !supplied ||
    !supplied.round ||
    !supplied.resolution ||
    !Array.isArray(supplied.answerMessages) ||
    !Array.isArray(supplied.confirmedAnswerMessageIds)
  )
    throw new Error(
      'planning context.clarification requires round, resolution, answerMessages and confirmedAnswerMessageIds',
    );
  for (const message of supplied.round.sourceMessages)
    if (
      !context.messages.some((current) => isDeepStrictEqual(current, message))
    )
      throw new Error(
        `Draft clarification source message ${message.id} is missing or changed`,
      );
  const originalContext: WorkflowPlanningContext = {
    messages: supplied.round.sourceMessages,
    operations: context.operations,
    capabilities: context.capabilities,
    ...(context.entrypoint === undefined
      ? {}
      : { entrypoint: context.entrypoint }),
  };
  const derived = prepareWorkflowDraftClarification({
    context: originalContext,
    round: supplied.round,
    resolution: supplied.resolution,
  });
  if (!isDeepStrictEqual(derived, supplied))
    throw new Error(
      'Draft clarification data differs from its original validated round and replies',
    );
  for (const message of derived.answerMessages)
    if (
      !context.messages.some((current) => isDeepStrictEqual(current, message))
    )
      throw new Error(
        `Draft clarification reply evidence ${message.id} is missing or changed`,
      );
  const questions = supplied.round.categories.flatMap(
    (category) => category.questions,
  );
  return {
    roundId: supplied.round.id,
    facts: structuredClone(derived.resolution.facts),
    pendingQuestions: structuredClone(
      questions.filter((question) =>
        derived.resolution.pendingQuestionIds.includes(question.id),
      ),
    ),
    deferredQuestions: structuredClone(
      questions.filter((question) =>
        derived.resolution.deferredQuestionIds.includes(question.id),
      ),
    ),
    requirementsPrompt: derived.resolution.requirementsPrompt,
    answerMessageIds: derived.answerMessages.map((message) => message.id),
    confirmedAnswerMessageIds: [...derived.confirmedAnswerMessageIds],
  };
}
