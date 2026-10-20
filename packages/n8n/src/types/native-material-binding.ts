import type {
  NativeOutputContract,
  ApiBindingMaterial,
  PlannedNativeNode,
  WorkflowNativeMaterialSources,
} from '@openapi-flow/core';
import type { N8nNativeOutputSource } from './output-binding-source.js';
import type { NativeItemExecutionOptions } from './native-capability.js';
import type { N8nNativeCapability } from './native-capability.js';
import type { N8nNodeFragment } from './node-fragment.js';

export type NativeRuntimeSourceBinding =
  { kind: 'provided'; sources: N8nNativeOutputSource[] } | { kind: 'compiled' };
export interface ResolveNativeRuntimeSourceInput {
  binding: NativeRuntimeSourceBinding;
  contract: NativeOutputContract;
  compiledSources?: N8nNativeOutputSource[];
  consumerId: string;
}
export interface BoundNativeArrayCapabilityInput extends NativeItemExecutionOptions {
  sources: NativeOutputContract[];
  runtime: NativeRuntimeSourceBinding;
}
export interface BoundItemJoinCapabilityInput {
  materials: ApiBindingMaterial[];
  scopes: NativeOutputContract[];
  runtime: NativeRuntimeSourceBinding;
}
export interface ResolveN8nNativeMaterialsInput {
  apiMaterials: ApiBindingMaterial[];
  nativeOutputs: NativeOutputContract[];
  nativeNodes: PlannedNativeNode[];
  capabilities: N8nNativeCapability[];
}
export interface ResolvedN8nNativeMaterials {
  capabilities: N8nNativeCapability[];
  outputs: NativeOutputContract[];
}
export interface CompileNativeMaterialFragmentsInput {
  nativeNodes: PlannedNativeNode[];
  materials: ResolvedN8nNativeMaterials;
  apiMaterials: ApiBindingMaterial[];
  apiNodeNames: Record<string, string>;
  singletonApiResponseIds?: string[];
  externalNativeOutputSources: N8nNativeOutputSource[];
  nodeIds: string[];
}
export interface CompiledNativeMaterialFragments {
  fragments: N8nNodeFragment[];
  outputSources: N8nNativeOutputSource[];
}
export interface MaterialBindableN8nCapability extends N8nNativeCapability {
  bindMaterialContracts: NonNullable<
    N8nNativeCapability['bindMaterialContracts']
  >;
}
export interface MaterialBoundN8nCapability extends MaterialBindableN8nCapability {
  materialSources: WorkflowNativeMaterialSources;
}
export type NativeMaterialFeatureDefinition = Pick<
  N8nNativeCapability,
  | 'name'
  | 'description'
  | 'parametersSchema'
  | 'parameterReferenceSources'
  | 'referenceStructureSchema'
  | 'parameterReferenceBindings'
  | 'waitsForAllInputs'
  | 'exclusiveOutputPorts'
  | 'materialRequirements'
  | 'inputPorts'
  | 'outputPorts'
>;
