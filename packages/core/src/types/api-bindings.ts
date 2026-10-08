import type { ApiOperationContract } from './api-operation.js';
import type { OutputBinding } from './api-arguments.js';
import type { JsonObject } from './openapi.js';
import type { NativeOutputContract } from './node-output.js';

export interface ApiBindingMaterial {
  callId: string;
  operation: ApiOperationContract;
  requestMediaType?: string;
}
export interface PlannedApiBindings {
  callId: string;
  bindings: OutputBinding[];
}
export interface ApiBindingPlan {
  calls: PlannedApiBindings[];
  gaps: ApiBindingGap[];
}
export interface ApiBindingGap {
  callId: string;
  targetPointer: string;
  description: string;
}
export interface ValidateApiBindingAssignmentsInput {
  calls: PlannedApiBindings[];
  materials: ApiBindingMaterial[];
  nativeOutputs?: NativeOutputContract[];
}
export interface ValidateApiBindingPlanInput {
  plan: ApiBindingPlan;
  materials: ApiBindingMaterial[];
  nativeOutputs?: NativeOutputContract[];
}
export type BindingSchema = JsonObject | boolean;
export type RequestContainerKind = 'array' | 'object';
