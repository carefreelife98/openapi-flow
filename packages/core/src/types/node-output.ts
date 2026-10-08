import type { BindingSchema } from './api-bindings.js';
import type { PlannedNativeNode, WorkflowCapability } from './workflow-plan.js';

/** A native node's JSON item contract, not an HTTP response envelope. */
export interface NativeOutputContract {
  nodeId: string;
  schema: BindingSchema;
}

export interface CreateNativeOutputContractsInput {
  nativeNodes: PlannedNativeNode[];
  capabilities: WorkflowCapability[];
}
