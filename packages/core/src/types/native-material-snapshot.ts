import type { ApiBindingMaterial } from './api-bindings.js';
import type { NativeOutputContract } from './node-output.js';
import type { WorkflowCapability, PlannedNativeNode } from './workflow-plan.js';

/** Authoritative data contracts for one material revision; no compiled node names. */
export interface WorkflowNativeMaterialSources {
  apiMaterials: ApiBindingMaterial[];
  nativeOutputs: NativeOutputContract[];
}
export interface WorkflowNativeMaterialRequirement {
  field: keyof WorkflowNativeMaterialSources;
  minimumItems: number;
}
export interface MissingWorkflowNativeMaterialRequirement extends WorkflowNativeMaterialRequirement {
  availableItems: number;
}
export interface ResolveNativeMaterialSnapshotInput extends WorkflowNativeMaterialSources {
  nativeNodes: PlannedNativeNode[];
  capabilities: WorkflowCapability[];
  /** Explicit unfinished reference decisions, never inferred successful output contracts. */
  deferredNodeIds: string[];
  /** Code-owned edit scheduling may defer a consumer once its actual upstream contracts are known. */
  shouldDeferNode?: (
    nodeId: string,
    availableOutputs: NativeOutputContract[],
    resolvedNodeIds: string[],
  ) => boolean;
}
export interface BoundNativeMaterialNode {
  nodeId: string;
  capability: WorkflowCapability;
}
export interface PendingNativeMaterialNode {
  nodeId: string;
  capability: string;
  kind: 'deferred-reference' | 'unavailable-source';
  sourceNodeIds: string[];
}
export interface NativeMaterialSnapshotFields {
  bindings: BoundNativeMaterialNode[];
  outputs: NativeOutputContract[];
  pending: PendingNativeMaterialNode[];
}
export type NativeMaterialSnapshot = NativeMaterialSnapshotFields &
  (
    | { status: 'ready'; capabilities: WorkflowCapability[] }
    | { status: 'pending' }
  );
