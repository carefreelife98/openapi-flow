import type { WorkflowNativeParameterReference } from './native-parameter-reference.js';
import type { BindingSchema } from './api-bindings.js';
import type { PlannedNativeNode, WorkflowCapability } from './workflow-plan.js';

/** Implementation-owned meaning and direct input references, never model explanations. */
export interface NativeOutputProvenance {
  capability: string;
  description: string;
  references: WorkflowNativeParameterReference[];
}

/** A native node's JSON item contract, not an HTTP response envelope. */
export interface NativeOutputContract {
  nodeId: string;
  schema: BindingSchema;
  /** Absent for externally supplied legacy contracts; unknown is not an empty lineage. */
  provenance?: NativeOutputProvenance;
}

export interface CreateNativeOutputContractsInput {
  nativeNodes: PlannedNativeNode[];
  capabilities: WorkflowCapability[];
}
