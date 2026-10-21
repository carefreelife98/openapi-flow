import type {
  WorkflowClarificationResolutionInput,
  WorkflowClarificationResolution,
  WorkflowRequirementFact,
} from '../../types/workflow-clarification.js';
import { workflowClarificationRepliesSchema } from '../../schemas/workflow-clarification-reply-schema.js';
import { formatWorkflowRequirementsPrompt } from './format-workflow-requirements-prompt.js';

/** Resolve explicit answer IDs and text only; no model, guessing or scope expansion. */
export function buildWorkflowClarificationResolution(
  input: WorkflowClarificationResolutionInput,
): WorkflowClarificationResolution {
  const replies = workflowClarificationRepliesSchema.parse(input.replies);
  const questions = input.round.categories.flatMap(
    (category) => category.questions,
  );
  const byQuestion = new Map(
    questions.map((question) => [question.id, question]),
  );
  for (const reply of replies)
    if (!byQuestion.has(reply.questionId))
      throw new Error(`Unknown clarification question ${reply.questionId}`);
  const byReply = new Map(replies.map((reply) => [reply.questionId, reply]));
  const facts: WorkflowRequirementFact[] = input.round.statements.map(
    (statement) => ({
      id: statement.id,
      text: statement.text,
      sources: structuredClone(statement.sources),
    }),
  );
  for (const question of questions) {
    const reply = byReply.get(question.id);
    if (!reply) continue;
    if (reply.kind === 'defer') continue;
    // Offered controls constrain choice IDs, not an explicitly authored human text answer.
    if (reply.kind !== 'text' && reply.kind !== question.answer.kind)
      throw new Error(
        `Clarification reply ${reply.questionId} must use ${question.answer.kind}`,
      );
    let answerText: string;
    if (reply.kind === 'text') answerText = reply.text;
    else {
      if (question.answer.kind === 'text')
        throw new Error(
          `Clarification question ${reply.questionId} has no choices`,
        );
      const choiceIds =
        reply.kind === 'single-choice' ? [reply.choiceId] : reply.choiceIds;
      const choices = choiceIds.map((id) => {
        const choice =
          question.answer.kind === 'text'
            ? undefined
            : question.answer.choices.find((choice) => choice.id === id);
        if (!choice)
          throw new Error(
            `Unknown clarification choice ${id} for ${reply.questionId}`,
          );
        return choice.label;
      });
      answerText = JSON.stringify(choices);
    }
    facts.push({
      id: `${question.id}:answer`,
      text: `${question.message}\n답변: ${answerText}`,
      sources: [
        {
          kind: 'clarification-answer',
          roundId: input.round.id,
          questionId: question.id,
        },
      ],
    });
  }
  const pendingQuestions = questions.filter(
    (question) => !byReply.has(question.id),
  );
  const deferredQuestions = questions.filter(
    (question) => byReply.get(question.id)?.kind === 'defer',
  );
  return {
    roundId: input.round.id,
    contextFingerprint: input.round.contextFingerprint,
    sourceMessages: structuredClone(input.round.sourceMessages),
    replies: questions.flatMap((question) => {
      const reply = byReply.get(question.id);
      return reply ? [reply] : [];
    }),
    facts,
    pendingQuestionIds: pendingQuestions.map((question) => question.id),
    deferredQuestionIds: deferredQuestions.map((question) => question.id),
    readyForPlanning: !pendingQuestions.length && !deferredQuestions.length,
    requirementsPrompt: formatWorkflowRequirementsPrompt({
      sourceMessages: input.round.sourceMessages,
      facts,
      pendingQuestions,
      deferredQuestions,
    }),
  };
}
