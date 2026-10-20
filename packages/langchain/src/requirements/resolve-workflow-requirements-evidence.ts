import type {
  WorkflowDecisionExplanation,
  WorkflowPlanningEvidence,
  WorkflowRequirementsProposal,
} from '@openapi-flow/core';
import type {
  CanonicalWorkflowExplanationFields,
  ProposedWorkflowPlanningEvidence,
  WorkflowClarificationOasCandidate,
  WorkflowRequirementsModelOutput,
} from '../types/workflow-clarification.js';

/** Candidate identity is code-owned, never copied from model-supplied OAS keys. */
export function resolveWorkflowRequirementsEvidence(
  proposal: WorkflowRequirementsModelOutput,
  candidates: WorkflowClarificationOasCandidate[],
): WorkflowRequirementsProposal {
  function evidence(
    item: ProposedWorkflowPlanningEvidence,
  ): WorkflowPlanningEvidence {
    if (item.kind !== 'oas') return structuredClone(item);
    const candidate = candidates.find(
      (candidate) => candidate.candidateId === item.candidateId,
    );
    if (!candidate)
      throw new Error(
        `Unknown clarification OAS candidate ${item.candidateId}`,
      );
    return {
      kind: 'oas',
      operation: structuredClone(candidate.operation.key),
      // This stage cites a complete supplied operation, not a model-built path.
      pointer: '',
    };
  }
  function explanation(
    value:
      WorkflowDecisionExplanation<ProposedWorkflowPlanningEvidence> | undefined,
  ): CanonicalWorkflowExplanationFields {
    return value === undefined
      ? {}
      : {
          explanation: {
            reason: value.reason,
            evidence: value.evidence.map(evidence),
          },
        };
  }
  return {
    statements: proposal.statements.map((statement) => ({
      text: statement.text,
      sources: structuredClone(statement.sources),
      ...explanation(statement.explanation),
    })),
    categories: proposal.categories.map((category) => ({
      title: category.title,
      ...explanation(category.explanation),
      questions: category.questions.map((question) => ({
        message: question.message,
        ...explanation(question.explanation),
        answer:
          question.answer.kind === 'text'
            ? question.answer
            : {
                kind: question.answer.kind,
                choices: question.answer.choices.map((choice) => ({
                  label: choice.label,
                  ...explanation(choice.explanation),
                })),
              },
      })),
    })),
    ...(proposal.suggestions === undefined
      ? {}
      : {
          suggestions: proposal.suggestions.map((suggestion) => ({
            text: suggestion.text,
            ...explanation(suggestion.explanation),
          })),
        }),
  };
}
