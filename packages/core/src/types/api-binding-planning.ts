import type { ApiOperationContract } from './api-operation.js';
import type {
  ApiBindingMaterial,
  ApiBindingPlanProposal,
  PlannedApiBindings,
} from './api-bindings.js';
import type { ApiResponsePointerCatalog } from './api-response-pointers.js';
import type { NativeOutputContract } from './node-output.js';

export interface ApiBindingPlanningInput {
  scenario: string;
  materials: ApiBindingMaterial[];
  nativeOutputs?: NativeOutputContract[];
}

export interface ApiBindingPlanningMaterial extends Pick<
  ApiBindingMaterial,
  'callId' | 'purpose' | 'requestMediaType'
> {
  operation: Pick<
    ApiOperationContract,
    'key' | 'method' | 'path' | 'operation' | 'effective'
  >;
  responsePointerCatalog: ApiResponsePointerCatalog[];
}

export interface ApiBindingPlanningContext {
  scenario: string;
  materials: ApiBindingPlanningMaterial[];
  nativeOutputs?: NativeOutputContract[];
}

export interface ApiBindingPlanningDescription {
  input: ApiBindingPlanningInput;
  context: ApiBindingPlanningContext;
}

export interface ApiBindingCallReason {
  callId: string;
  reason?: string;
}

export interface ExplainedApiBindingCall extends PlannedApiBindings {
  reason?: string;
}

export interface ApiBindingPlanningRecord {
  kind: 'proposed-bindings';
  calls: ExplainedApiBindingCall[];
  /** The original gap description is its reason; do not generate a duplicate. */
  gaps: ApiBindingPlanProposal['gaps'];
  evidence: {
    kind: 'supplied-binding-contracts';
    context: ApiBindingPlanningContext;
  };
}

export interface CreateApiBindingPlanningRecordInput extends ApiBindingPlanningInput {
  plan: ApiBindingPlanProposal;
  reasons: ApiBindingCallReason[];
}

export interface ValidateApiBindingPlanningRecordInput extends ApiBindingPlanningInput {
  plan: ApiBindingPlanProposal;
  record: ApiBindingPlanningRecord;
}
