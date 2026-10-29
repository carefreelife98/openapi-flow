import type {
  ApiBindingCandidateCatalog,
  ApiBindingKeyCandidate,
  BindingPointerTemplate,
} from '@openapi-flow/core';
import { listBindingKeyChoices } from './list-binding-key-choices.js';

/** Unconfirmed names are not model choices; manual core binding APIs stay unchanged. */
export function restrictModelBindingCandidates(
  catalog: ApiBindingCandidateCatalog,
  callId: string,
  keys: ApiBindingKeyCandidate[],
): ApiBindingCandidateCatalog {
  function namesAvailable(
    template: BindingPointerTemplate,
    nodeId: string,
  ): boolean {
    return template.segments.every(
      (segment) =>
        (segment.kind !== 'key' && segment.kind !== 'descendant') ||
        listBindingKeyChoices(segment, nodeId, keys).length > 0,
    );
  }
  return {
    ...catalog,
    candidates: catalog.candidates.filter(
      (candidate) =>
        namesAvailable(candidate.source, candidate.sourceNodeId) &&
        namesAvailable(candidate.target, callId),
    ),
  };
}
