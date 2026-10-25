import type {
  ApiBindingSourceSelection,
  ResolveApiBindingSourceSelectionInput,
} from '../../types/api-call-binding-planning.js';
import { apiBindingSourceProposalSchema } from '../../schemas/api-call-binding-planning-schema.js';
import { describeApiCallBindingPlanning } from './describe-api-call-binding-planning.js';
import { validateApiBindingGaps } from '../validate-api-binding-gaps.js';

export function resolveApiBindingSourceSelection(
  input: ResolveApiBindingSourceSelectionInput,
): ApiBindingSourceSelection {
  const description = describeApiCallBindingPlanning(input);
  const proposal = apiBindingSourceProposalSchema.parse(input.proposal);
  const allowed = new Set(
    description.sourceCandidates.map((item) => item.nodeId),
  );
  if (
    new Set(proposal.sourceNodeIds).size !== proposal.sourceNodeIds.length ||
    proposal.sourceNodeIds.some((id) => !allowed.has(id))
  )
    throw new Error(
      'binding source selection contains duplicate, self or unknown source IDs',
    );
  if (
    input.includeExplanations === true
      ? proposal.reason === undefined || !proposal.reason.trim()
      : proposal.reason !== undefined
  )
    throw new Error('binding source reason does not match includeExplanations');
  validateApiBindingGaps({
    ...description.input,
    plan: {
      calls: [],
      gaps: proposal.gaps.map((gap) => ({ ...gap, callId: input.callId })),
    },
  });
  return {
    ...structuredClone(proposal),
    fingerprint: description.fingerprint,
    callId: description.input.callId,
  };
}
