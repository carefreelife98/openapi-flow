import { createWorkflowReviewChoiceSuggestion } from '@openapi-flow/core';
import type {
  WorkflowReviewSuggestionsInput,
  WorkflowReviewSuggestionsProposal,
  WorkflowReviewSuggestionEvidence,
} from '@openapi-flow/core';
import type {
  WorkflowReviewSuggestionsModelOutput,
  ProposedWorkflowReviewSuggestionEvidence,
} from '../types/workflow-review-suggestions.js';
import type { WorkflowClarificationOasCandidate } from '../types/workflow-clarification.js';

/** Resolve identities once; choice text is compiled from the same source contract rather than repaired. */
export function resolveWorkflowReviewSuggestions(
  input: WorkflowReviewSuggestionsInput,
  proposal: WorkflowReviewSuggestionsModelOutput,
  candidates: WorkflowClarificationOasCandidate[],
): WorkflowReviewSuggestionsProposal {
  function evidence(
    source: ProposedWorkflowReviewSuggestionEvidence,
  ): WorkflowReviewSuggestionEvidence {
    if (source.kind !== 'oas') return structuredClone(source);
    const candidate = candidates.find(
      (item) => item.candidateId === source.candidateId,
    );
    if (candidate === undefined)
      throw new Error(`Unknown review OAS candidate ${source.candidateId}`);
    return {
      kind: 'oas',
      operation: structuredClone(candidate.operation.key),
      pointer: '',
    };
  }
  return {
    suggestions: proposal.suggestions.map((suggestion) =>
      suggestion.kind === 'answer-choice'
        ? createWorkflowReviewChoiceSuggestion({
            ...input,
            proposal: suggestion,
          })
        : { ...suggestion, sources: suggestion.sources.map(evidence) },
    ),
  };
}
