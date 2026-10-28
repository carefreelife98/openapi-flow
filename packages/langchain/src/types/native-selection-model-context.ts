import type {
  NativeInstanceSelectionContext,
  NativePlanningCapabilityMaterial,
  WorkflowNativeMaterialSources,
} from '@openapi-flow/core';

/** Transport references never replace the original selection or its source receipt. */
export interface NativeSelectionModelCapability extends NativePlanningCapabilityMaterial {
  materialSourcesRef?: number;
}

export interface NativeSelectionModelContext extends Omit<
  NativeInstanceSelectionContext,
  'capabilities'
> {
  capabilities: NativeSelectionModelCapability[];
  materialSourceSets?: WorkflowNativeMaterialSources[];
}
