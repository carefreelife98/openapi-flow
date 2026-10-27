import type { WorkflowCapability, PlannedNativeNode } from './workflow-plan.js';
import type { NativeOutputContract } from './node-output.js';

export interface WorkflowCapabilityPlanningContext {
  apiCallIds: string[];
  /** Actual completed producer contracts only; omitted exposes no native output operands. */
  nativeOutputs?: NativeOutputContract[];
}

export interface WorkflowCapabilityPlanningInput extends WorkflowCapabilityPlanningContext {
  capabilities: WorkflowCapability[];
}

export interface ValidateNativeApiResponseReferencesInput extends WorkflowCapabilityPlanningInput {
  nativeNodes: PlannedNativeNode[];
}
