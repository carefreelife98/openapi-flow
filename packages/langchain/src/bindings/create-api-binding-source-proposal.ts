import type {
  ApiBindingSourceProposal,
  WorkflowSourceMessage,
} from '@openapi-flow/core';
import { attributeApiBindingKeySources } from './attribute-api-binding-key-sources.js';
import type { ApiBindingSourceDecisionOutput } from '../types/api-call-binding-planning.js';

/** Code owns the empty fields implied by a validated model decision; it never repairs raw output. */
export function createApiBindingSourceProposal(
  output: ApiBindingSourceDecisionOutput,
  messages?: WorkflowSourceMessage[],
): ApiBindingSourceProposal {
  const reason = 'reason' in output ? { reason: output.reason } : {};
  const decision = output.decision;
  const keySelections =
    'keySelections' in decision && decision.keySelections !== undefined
      ? {
          keySelections: attributeApiBindingKeySources(
            decision.keySelections,
            messages,
          ),
        }
      : {};
  switch (decision.kind) {
    case 'independent-inputs':
      return { sourceNodeIds: [], gaps: [], ...reason };
    case 'selected-response-sources':
      return {
        sourceNodeIds: decision.sourceNodeIds,
        gaps: [],
        ...keySelections,
        ...reason,
      };
    case 'missing-response-sources':
      return { sourceNodeIds: [], gaps: decision.gaps, ...reason };
    case 'partially-missing-response-sources':
      return {
        sourceNodeIds: decision.sourceNodeIds,
        gaps: decision.gaps,
        ...keySelections,
        ...reason,
      };
  }
}
