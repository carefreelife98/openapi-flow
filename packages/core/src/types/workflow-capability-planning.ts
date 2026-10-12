import type { WorkflowCapability, PlannedNativeNode } from './workflow-plan.js';

export interface WorkflowCapabilityPlanningContext {
  apiCallIds: string[];
}

export interface WorkflowCapabilityPlanningInput extends WorkflowCapabilityPlanningContext {
  capabilities: WorkflowCapability[];
}

export interface ValidateNativeApiResponseReferencesInput extends WorkflowCapabilityPlanningInput {
  nativeNodes: PlannedNativeNode[];
}
