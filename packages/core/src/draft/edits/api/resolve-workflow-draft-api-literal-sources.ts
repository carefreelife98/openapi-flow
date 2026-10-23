import type {
  ResolveWorkflowDraftApiLiteralSourcesInput,
  VerifiedWorkflowDraftApiLiteralSource,
} from '../../../types/workflow-draft-api-literal-sources.js';
import { resolveApiLiteralProposalSources } from '../../../arguments/sources/resolve-api-literal-proposal-sources.js';

/** OAS validation and message existence alone do not establish a literal's origin. */
export function resolveWorkflowDraftApiLiteralSources(
  input: ResolveWorkflowDraftApiLiteralSourcesInput,
): VerifiedWorkflowDraftApiLiteralSource[] {
  const { description, proposal } = input;
  // Empty parameter-location objects contain no request values. Empty body
  // objects/arrays are actual data and still require their own source.
  return resolveApiLiteralProposalSources({
    callId: description.nodeId,
    values: proposal.values,
    sources:
      proposal.literalSources === undefined ? [] : proposal.literalSources,
    messages: [...description.messages, ...description.backgroundMessages],
  });
}
