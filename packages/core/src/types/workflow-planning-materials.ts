import type { ApiBindingMaterial } from './api-bindings.js';
import type { WorkflowCapability, PlannedNativeNode } from './workflow-plan.js';
import type { ReviewableWorkflowApiMaterial } from './reviewable-workflow.js';
import type { NativeOutputContract } from './node-output.js';
import type { NativePlanningCapabilityMaterial } from './native-node-planning.js';

export interface WorkflowPlanningMaterialInput {
  scenario: string;
  capabilities?: WorkflowCapability[];
  apiMaterials?: ApiBindingMaterial[];
  preparedNativeNodes?: PlannedNativeNode[];
}

export type WorkflowPlanningMaterialSnapshot = Required<
  Omit<WorkflowPlanningMaterialInput, 'scenario'>
>;

export interface WorkflowPlanningDataInput {
  scenario: string;
  materials: ReviewableWorkflowApiMaterial[];
  capabilities?: WorkflowCapability[];
  preparedNativeNodes?: PlannedNativeNode[];
}

export interface WorkflowPlanningDataSnapshot {
  materials: ReviewableWorkflowApiMaterial[];
  capabilities: WorkflowCapability[];
  preparedNativeNodes: PlannedNativeNode[];
}

export interface WorkflowPlanningSourceEvidence {
  /** Original supplied API contracts/values, not an extra model-generated contract. */
  materials: ReviewableWorkflowApiMaterial[];
  nativeOutputs: NativeOutputContract[];
  capabilities: NativePlanningCapabilityMaterial[];
}
