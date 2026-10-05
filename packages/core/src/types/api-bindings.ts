import type { ApiOperationContract } from './api-operation.js';
import type { OutputBinding } from './api-arguments.js';
import type { JsonObject } from './openapi.js';
import type { WorkflowPlanGap } from './workflow-plan.js';

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
  gaps: WorkflowPlanGap[];
}
export interface ValidateApiBindingPlanInput {
  plan: ApiBindingPlan;
  materials: ApiBindingMaterial[];
}
export type BindingSchema = JsonObject | boolean;
export type RequestContainerKind = 'array' | 'object';
