import type {
  IdentifiedClarificationPart,
  WorkflowClarificationRound,
  WorkflowRequirementsProposal,
} from '../../types/workflow-clarification.js';

function withoutIdentity<Part extends IdentifiedClarificationPart>(
  part: Part,
): Omit<Part, 'id'> {
  const result = { ...part };
  Reflect.deleteProperty(result, 'id');
  return result;
}

/** Remove only the code-owned identities; strict proposal parsing follows. */
export function proposalFromClarificationRound(
  round: WorkflowClarificationRound,
): WorkflowRequirementsProposal {
  return {
    statements: round.statements.map(withoutIdentity),
    categories: round.categories.map((category) => ({
      ...withoutIdentity(category),
      questions: category.questions.map((question) => ({
        ...withoutIdentity(question),
        answer:
          question.answer.kind === 'text'
            ? question.answer
            : {
                ...question.answer,
                choices: question.answer.choices.map(withoutIdentity),
              },
      })),
    })),
    ...(round.suggestions === undefined
      ? {}
      : {
          suggestions: round.suggestions.map(withoutIdentity),
        }),
  };
}
