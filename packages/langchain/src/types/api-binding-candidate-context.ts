import type {
  BindingPointerTemplate,
  ApiBindingKeyCandidate,
} from '@openapi-flow/core';

export interface ApiBindingSourceField extends BindingPointerTemplate {
  id: string;
  nodeId: string;
}
export interface ApiBindingTargetField extends BindingPointerTemplate {
  id: string;
}
export interface ApiBindingCandidateReference {
  id: string;
  sourceId: string;
  targetId: string;
}
export interface ApiBindingCandidateContext {
  bindingKeyCandidates: ApiBindingKeyCandidate[];
  bindingCandidates: ApiBindingCandidateReference[];
  bindingSourceFields: ApiBindingSourceField[];
  bindingTargetFields: ApiBindingTargetField[];
}
