import type { ApiOperationCandidate, ApiOperationKey } from './api-catalog.js';
import type { WorkflowDecisionExplanation } from './workflow-clarification.js';

/** Discovery metadata is not a resolved request/response/security contract. */
export interface ApiSelectionContext {
  scenario: string;
  operations: ApiOperationCandidate[];
}

export type ApiSelectionEvidence =
  | { kind: 'scenario'; text: string }
  | { kind: 'discovery'; candidates: ApiOperationCandidate[] };

export type ApiSelectionExplanation =
  WorkflowDecisionExplanation<ApiSelectionEvidence>;

export type ApiSelectionExplanationBasis =
  { kind: 'catalog' } | { kind: 'candidates'; operations: ApiOperationKey[] };

export interface CreateApiSelectionExplanationInput {
  context: ApiSelectionContext;
  basis: ApiSelectionExplanationBasis;
  reason: string;
}

export interface ValidateApiSelectionExplanationInput extends Omit<
  CreateApiSelectionExplanationInput,
  'reason'
> {
  explanation: ApiSelectionExplanation;
}
