import type {
  WorkflowDraftEditProposal,
  WorkflowDraftEditDecision,
  WorkflowPlanningEvidence,
} from '@openapi-flow/core';
import type {
  WorkflowDraftEditModelOutput,
  WorkflowDraftEditOperationCandidate,
} from '../types/workflow-draft-edit.js';
import type { ProposedWorkflowPlanningEvidence } from '../types/workflow-clarification.js';

export function resolveWorkflowDraftEditProposal(
  proposed: WorkflowDraftEditModelOutput,
  candidates: WorkflowDraftEditOperationCandidate[],
): WorkflowDraftEditProposal {
  function operation(candidateId: string) {
    const candidate = candidates.find(
      (candidate) => candidate.candidateId === candidateId,
    );
    if (!candidate)
      throw new Error(`Unknown draft edit operation candidate ${candidateId}`);
    return structuredClone(candidate.operation.key);
  }
  function evidence(
    item: ProposedWorkflowPlanningEvidence,
  ): WorkflowPlanningEvidence {
    return item.kind === 'oas'
      ? { kind: 'oas', operation: operation(item.candidateId), pointer: '' }
      : structuredClone(item);
  }
  return {
    decisions: proposed.decisions.map((decision): WorkflowDraftEditDecision => {
      const { explanation, ...original } = decision;
      const fields =
        explanation === undefined
          ? {}
          : {
              explanation: {
                reason: explanation.reason,
                evidence: explanation.evidence.map(evidence),
              },
            };
      if (original.kind === 'report-capability-gap') {
        const finding = original.finding;
        return {
          ...original,
          finding:
            finding.kind === 'api-contract-gap'
              ? { ...finding, operation: operation(finding.operation) }
              : finding,
          ...fields,
        };
      }
      return 'operation' in original
        ? { ...original, operation: operation(original.operation), ...fields }
        : { ...original, ...fields };
    }),
  };
}
