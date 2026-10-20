import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type {
  CreateWorkflowReviewSuggestionsInput,
  WorkflowReviewSuggestions,
} from '../../types/workflow-review-suggestions.js';
import { describeWorkflowReviewSuggestions } from './describe-workflow-review-suggestions.js';
import { createWorkflowReviewSuggestionsProposalSchema } from '../../schemas/create-workflow-review-suggestions-proposal-schema.js';
import { workflowReviewSuggestionEvidenceSchema } from '../../schemas/workflow-review-suggestion-evidence-schema.js';
import { validateDescribedWorkflowPlanningEvidence } from '../../planning/evidence/validate-workflow-planning-evidence.js';

export function createWorkflowReviewSuggestions(
  input: CreateWorkflowReviewSuggestionsInput,
): WorkflowReviewSuggestions {
  const description = describeWorkflowReviewSuggestions(input);
  const proposal = createWorkflowReviewSuggestionsProposalSchema(
    description,
    workflowReviewSuggestionEvidenceSchema,
  ).parse(input.proposal);
  if (!isDeepStrictEqual(proposal, input.proposal))
    throw new Error(
      'Review suggestions must validate without defaults, coercion or transformation',
    );
  for (const suggestion of proposal.suggestions) {
    const keys = suggestion.sources.map((source) => JSON.stringify(source));
    if (new Set(keys).size !== keys.length)
      throw new Error(
        'Review suggestion evidence must not repeat identical sources',
      );
    for (const source of suggestion.sources) {
      if (source.kind === 'review-question') {
        if (
          !description.boundary.questions.some(
            (question) => question.id === source.questionId,
          )
        )
          throw new Error(
            `Review suggestion cites unknown current question ${source.questionId}`,
          );
      } else
        validateDescribedWorkflowPlanningEvidence(description.context, [
          source,
        ]);
    }
    if (
      suggestion.kind === 'answer-question' &&
      suggestion.questionIds.some(
        (id) =>
          !suggestion.sources.some(
            (source) =>
              source.kind === 'review-question' && source.questionId === id,
          ),
      )
    )
      throw new Error(
        'An answer suggestion must cite every actual question it proposes to answer',
      );
  }
  const id =
    'workflow-review:' +
    createHash('sha256')
      .update(JSON.stringify([description.fingerprint, proposal]))
      .digest('hex');
  return {
    id,
    fingerprint: description.fingerprint,
    boundaryKey: description.boundary.key,
    target: {
      kind: description.boundary.kind,
      revision: description.boundary.revision,
      questions: structuredClone(description.boundary.questions),
      data: structuredClone(description.boundary.data),
    },
    limits: description.limits,
    options: description.options,
    suggestions: proposal.suggestions.map((suggestion, index) => ({
      ...suggestion,
      id: `${id}:suggestion:${index + 1}`,
    })),
  };
}
