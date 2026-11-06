import type {
  ApiBindingSourceSelection,
  ResolveApiBindingSourceSelectionInput,
  ApiCallBindingPlanningDescription,
  ApiBindingSourceProposal,
  ResolveWorkflowApiBindingSourcesInput,
} from '../../types/api-call-binding-planning.js';
import { apiBindingSourceProposalSchema } from '../../schemas/api-call-binding-planning-schema.js';
import {
  describeApiCallBindingPlanning,
  describeApiBindingCalls,
} from './describe-api-call-binding-planning.js';
import { createApiBindingKeyCatalog } from '../candidates/create-api-binding-key-catalog.js';
import { validateApiBindingGaps } from '../validate-api-binding-gaps.js';

export function resolveApiBindingSourceSelection(
  input: ResolveApiBindingSourceSelectionInput,
): ApiBindingSourceSelection {
  const description = describeApiCallBindingPlanning(input);
  return resolvePreparedApiBindingSourceSelection(description, input.proposal);
}

export function resolveWorkflowApiBindingSources(
  input: ResolveWorkflowApiBindingSourcesInput,
): ApiBindingSourceSelection[] {
  const descriptions = describeApiBindingCalls(input);
  if (
    Object.keys(input.proposals).length !== descriptions.length ||
    descriptions.some(
      (description) =>
        !Object.hasOwn(input.proposals, description.input.callId),
    )
  )
    throw new Error(
      'Workflow binding source proposals must cover exactly the supplied calls',
    );
  return descriptions.map((description) =>
    resolvePreparedApiBindingSourceSelection(
      description,
      input.proposals[description.input.callId]!,
    ),
  );
}

function resolvePreparedApiBindingSourceSelection(
  description: ApiCallBindingPlanningDescription,
  original: ApiBindingSourceProposal,
): ApiBindingSourceSelection {
  const input = description.input;
  const proposal = apiBindingSourceProposalSchema.parse(original);
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
