import type {
  ApiBindingSourceSelection,
  ResolveApiBindingSourceSelectionInput,
} from '../../types/api-call-binding-planning.js';
import { apiBindingSourceProposalSchema } from '../../schemas/api-call-binding-planning-schema.js';
import { describeApiCallBindingPlanning } from './describe-api-call-binding-planning.js';
import { createApiBindingKeyCatalog } from '../candidates/create-api-binding-key-catalog.js';
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
  if (proposal.keySelections !== undefined) {
    if (description.input.literalSourceMessages === undefined)
      throw new Error('Binding key selections require literalSourceMessages');
    createApiBindingKeyCatalog({
      selections: proposal.keySelections,
      messages: description.input.literalSourceMessages,
      nodeIds: [description.input.callId, ...proposal.sourceNodeIds],
    });
  }
  validateApiBindingGaps({
    ...description.input,
    plan: {
      calls: [],
      gaps: proposal.gaps.map((gap) => ({ ...gap, callId: input.callId })),
    },
  });
  return {
    sourceNodeIds: structuredClone(proposal.sourceNodeIds),
    ...(proposal.keySelections === undefined
      ? {}
      : { keySelections: structuredClone(proposal.keySelections) }),
    gaps: structuredClone(proposal.gaps),
    ...(input.includeExplanations === true && proposal.reason !== undefined
      ? { reason: proposal.reason }
      : {}),
    fingerprint: description.fingerprint,
    callId: description.input.callId,
  };
}
