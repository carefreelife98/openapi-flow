import type { ApiBindingSourceProposal } from '@openapi-flow/core';
import type { ApiBindingSourceDecisionOutput } from '../types/api-call-binding-planning.js';

/** Code owns the empty fields implied by a validated model decision; it never repairs raw output. */
export function createApiBindingSourceProposal(
  output: ApiBindingSourceDecisionOutput,
): ApiBindingSourceProposal {
  const reason = 'reason' in output ? { reason: output.reason } : {};
  const decision = output.decision;
  switch (decision.kind) {
    case 'independent-inputs':
      return { sourceNodeIds: [], gaps: [], ...reason };
    case 'selected-response-sources':
      return { sourceNodeIds: decision.sourceNodeIds, gaps: [], ...reason };
    case 'missing-response-sources':
      return { sourceNodeIds: [], gaps: decision.gaps, ...reason };
    case 'partially-missing-response-sources':
      return {
        sourceNodeIds: decision.sourceNodeIds,
        gaps: decision.gaps,
        ...reason,
      };
  }
}
