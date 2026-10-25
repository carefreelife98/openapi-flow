import type { ApiBindingPlanningInput } from './api-binding-planning.js';
import type { ApiBindingGap, BindingSchema } from './api-bindings.js';
import type { ApiOperationKey } from './api-catalog.js';
import type { OutputBinding } from './api-arguments.js';
import type { JsonObject } from './openapi.js';

export interface ApiCallBindingPlanningInput extends ApiBindingPlanningInput {
  callId: string;
  includeExplanations?: boolean;
}

/** Discovery index only; it never replaces an original response contract. */
export interface ApiBindingSourceCandidate {
  kind: 'api' | 'native';
  nodeId: string;
  key?: ApiOperationKey;
  method?: string;
  path?: string;
  summary?: string;
  description?: string;
  purpose?: string;
  operationId?: string;
  tags?: string[];
  outputPointers: string[];
  schema?: BindingSchema;
}

export interface ApiCallBindingPlanningDescription {
  fingerprint: string;
  input: ApiCallBindingPlanningInput;
  target: ApiBindingSourceCandidate;
  requestSchema: JsonObject;
  sourceCandidates: ApiBindingSourceCandidate[];
}

export type ApiCallBindingGap = Omit<ApiBindingGap, 'callId'>;

export interface ApiBindingSourceProposal {
  sourceNodeIds: string[];
  gaps: ApiCallBindingGap[];
  reason?: string;
}

export interface ApiBindingSourceSelection extends ApiBindingSourceProposal {
  fingerprint: string;
  callId: string;
}

export interface ApiCallBindingProposal {
  bindings: Omit<OutputBinding, 'kind'>[];
  gaps: ApiCallBindingGap[];
  reason?: string;
}

export interface ApiCallBindingPlan {
  fingerprint: string;
  callId: string;
  sources: ApiBindingSourceSelection;
  bindings: OutputBinding[];
  gaps: ApiBindingGap[];
  reason?: string;
}

export interface ResolveApiBindingSourceSelectionInput extends ApiCallBindingPlanningInput {
  proposal: ApiBindingSourceProposal;
}

export interface ResolveApiCallBindingPlanInput extends ApiCallBindingPlanningInput {
  sources: ApiBindingSourceSelection;
  proposal: ApiCallBindingProposal;
}

export interface AssembleApiBindingPlanInput extends ApiBindingPlanningInput {
  results: ApiCallBindingPlan[];
  includeExplanations?: boolean;
}

export interface ValidateApiCallBindingPlanInput extends ApiCallBindingPlanningInput {
  result: ApiCallBindingPlan;
}
