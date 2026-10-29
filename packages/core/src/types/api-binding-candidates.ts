import type { BindingSchema } from './api-bindings.js';
import type {
  ApiCallBindingGap,
  ApiCallBindingPlanningInput,
  ApiBindingSourceSelection,
} from './api-call-binding-planning.js';

export type BindingPointerSegment =
  | { kind: 'property'; value: string }
  | { kind: 'index'; minimum: number; maximum?: number }
  | {
      kind: 'key';
      pattern?: string;
      excludedKeys?: string[];
      excludedPatterns?: string[];
    }
  | { kind: 'descendant' };

export type BindingPointerKeySegment = Extract<
  BindingPointerSegment,
  { kind: 'key' }
>;

export interface BindingPointerTemplate {
  segments: BindingPointerSegment[];
  /** Possible JSON types, not a proof of assignability or runtime presence. */
  types: string[];
}

export interface ApiBindingCandidate {
  id: string;
  sourceNodeId: string;
  source: BindingPointerTemplate;
  target: BindingPointerTemplate;
}

export interface DescribeApiBindingCandidatesInput extends ApiCallBindingPlanningInput {
  sources: ApiBindingSourceSelection;
}

export interface ApiBindingCandidateCatalog {
  fingerprint: string;
  candidates: ApiBindingCandidate[];
}

export type BindingPointerSelections = Record<
  string,
  string | number | string[]
>;

export interface ApiBindingCandidateChoice {
  candidateId: string;
  sourceSelections: BindingPointerSelections;
  targetSelections: BindingPointerSelections;
}

export interface ApiBindingCandidateProposal {
  bindings: ApiBindingCandidateChoice[];
  gaps: ApiCallBindingGap[];
  reason?: string;
}

export interface ResolveApiBindingCandidatesInput extends DescribeApiBindingCandidatesInput {
  proposal: ApiBindingCandidateProposal;
}

export interface BindingTemplateTraversal {
  schema: BindingSchema;
  segments: BindingPointerSegment[];
}
