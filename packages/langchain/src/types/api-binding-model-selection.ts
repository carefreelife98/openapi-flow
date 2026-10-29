import type {
  ApiBindingCandidateProposal,
  ApiBindingCandidateChoice,
  BindingPointerSegment,
} from '@openapi-flow/core';

export type ApiBindingModelSelection =
  number | { keyId: string } | { pathId: string };
export type ApiBindingModelSelections = Record<
  string,
  ApiBindingModelSelection
>;
export interface ApiBindingModelCandidateChoice extends Pick<
  ApiBindingCandidateChoice,
  'candidateId'
> {
  sourceSelections: ApiBindingModelSelections;
  targetSelections: ApiBindingModelSelections;
}
export interface ApiBindingModelCandidateProposal extends Pick<
  ApiBindingCandidateProposal,
  'gaps' | 'reason'
> {
  bindings: ApiBindingModelCandidateChoice[];
}
export type BindingDynamicNameSegment = Extract<
  BindingPointerSegment,
  { kind: 'key' | 'descendant' }
>;
