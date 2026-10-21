import type {
  CreateWorkflowReviewChoiceSuggestionInput,
  ProposedWorkflowReviewSuggestion,
  WorkflowReviewChoiceReply,
} from '../../types/workflow-review-suggestions.js';
import { describeWorkflowReviewSuggestions } from './describe-workflow-review-suggestions.js';
import { createWorkflowReviewChoiceSuggestionSchema } from '../../schemas/workflow-review-choice-suggestion-schema.js';

/** Derive display and a typed reply from the same original contract. This does not submit or adopt the reply. */
export function createWorkflowReviewChoiceSuggestion(
  input: CreateWorkflowReviewChoiceSuggestionInput,
): ProposedWorkflowReviewSuggestion {
  const description = describeWorkflowReviewSuggestions(input);
  const question = description.boundary.questions.find(
    (item) => item.id === input.proposal.questionId,
  );
  if (question === undefined || question.answer === undefined)
    throw new Error(
      'Review choice proposal references a missing current choice contract',
    );
  const answer = question.answer;
  const proposal = createWorkflowReviewChoiceSuggestionSchema(
    question,
    description.options.includeExplanations,
  ).parse(input.proposal);
  const labels = proposal.choiceIds.map((id) => {
    const choice = answer.choices.find((item) => item.id === id);
    if (choice === undefined)
      throw new Error(
        'Review choice proposal references an unknown original choice',
      );
    return choice.label;
  });
  let choiceReply: WorkflowReviewChoiceReply;
  if (answer.kind === 'single-choice') {
    const choiceId = proposal.choiceIds[0];
    if (choiceId === undefined)
      throw new Error('Review single-choice proposal has no choiceId');
    choiceReply = { kind: 'single-choice', questionId: question.id, choiceId };
  } else {
    choiceReply = {
      kind: 'multiple-choice',
      questionId: question.id,
      choiceIds: [...proposal.choiceIds],
    };
  }
  return {
    kind: 'answer-question',
    questionIds: [question.id],
    text: `${question.message}\n선택: ${labels.join(', ')}`,
    choiceReply,
    sources: [{ kind: 'review-question', questionId: question.id }],
    ...(proposal.reason === undefined ? {} : { reason: proposal.reason }),
  };
}
