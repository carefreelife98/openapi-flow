import type {
  ApiBindingCandidateCatalog,
  ApiBindingCandidateProposal,
  ApiBindingKeyCandidate,
  BindingPointerSelections,
  BindingPointerTemplate,
} from '@openapi-flow/core';
import type {
  ApiBindingModelCandidateProposal,
  ApiBindingModelSelections,
} from '../types/api-binding-model-selection.js';
import { listBindingKeyChoices } from './list-binding-key-choices.js';

/** IDs select verified original strings; raw field/path generation is never interpreted. */
export function resolveModelBindingSelections(
  proposal: ApiBindingModelCandidateProposal,
  catalog: ApiBindingCandidateCatalog,
  keys: ApiBindingKeyCandidate[],
  callId: string,
): ApiBindingCandidateProposal {
  function resolve(
    template: BindingPointerTemplate,
    selections: ApiBindingModelSelections,
    nodeId: string,
  ): BindingPointerSelections {
    const result: BindingPointerSelections = {};
    for (const segment of template.segments) {
      if (segment.kind === 'property') continue;
      const slot = 's' + Object.keys(result).length;
      const selection = selections[slot];
      if (segment.kind === 'index') {
        if (typeof selection !== 'number')
          throw new Error(`Binding index ${slot} must be a number`);
        result[slot] = selection;
      } else {
        if (typeof selection !== 'object' || selection === null)
          throw new Error(
            `Binding name ${slot} requires a verified key/path ID`,
          );
        const id =
          segment.kind === 'key' && 'keyId' in selection
            ? selection.keyId
            : segment.kind === 'descendant' && 'pathId' in selection
              ? selection.pathId
              : undefined;
        const key = listBindingKeyChoices(segment, nodeId, keys).find(
          (item) => item.id === id,
        );
        if (!key)
          throw new Error(
            `Binding name ${slot} has an unknown or wrong-scope key/path ID`,
          );
        result[slot] = segment.kind === 'key' ? key.value : [...key.tokens];
      }
    }
    if (Object.keys(result).length !== Object.keys(selections).length)
      throw new Error('Model binding selections contain undeclared slots');
    return result;
  }
  return {
    ...proposal,
    bindings: proposal.bindings.map((choice) => {
      const candidate = catalog.candidates.find(
        (item) => item.id === choice.candidateId,
      );
      if (!candidate)
        throw new Error('Unknown or stale model binding candidate');
      return {
        candidateId: choice.candidateId,
        sourceSelections: resolve(
          candidate.source,
          choice.sourceSelections,
          candidate.sourceNodeId,
        ),
        targetSelections: resolve(
          candidate.target,
          choice.targetSelections,
          callId,
        ),
      };
    }),
  };
}
