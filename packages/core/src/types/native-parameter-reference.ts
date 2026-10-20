import type {
  WorkflowValueReference,
  PlannedNativeNode,
  WorkflowCapability,
} from './workflow-plan.js';

export interface WorkflowExclusiveOutputReference {
  source: 'exclusive-output';
  nodeId: string;
}
export type WorkflowNativeParameterReference =
  WorkflowValueReference | WorkflowExclusiveOutputReference;

/** Implementation-owned locations; never discovered by matching property names or values. */
export interface WorkflowNativeReferenceBinding {
  nodeIdPointer: string;
  /** Omitted means the implementation owns a fixed value pointer, not a model field. */
  valuePointer?: string;
  reference: WorkflowNativeParameterReference;
}
export interface DescribeNativeReferenceBindingsInput {
  node: PlannedNativeNode;
  capability: WorkflowCapability;
}
