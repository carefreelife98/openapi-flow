import type {
  NativeRuntimeParameterMaterialization,
  NativeRuntimeInputSlot,
  NativeRuntimeInputValues,
  PlannedNativeNode,
  ApiBindingMaterial,
  NativeOutputContract,
} from '@openapi-flow/core';
import type { N8nTemplateInputSlotMapping } from './workflow-template.js';
import type {
  BuildN8nWorkflowInput,
  N8nWorkflowJSON,
} from './workflow-compilation.js';
import type {
  CompileNativeNodeInput,
  N8nNativeCapability,
} from './native-capability.js';
import type { N8nNodeFragment } from './node-fragment.js';

export interface N8nNativeRuntimeInput {
  materialization: NativeRuntimeParameterMaterialization;
  revision: number;
  inputNodeName: string;
}

export interface PrependNativeParameterGuardInput {
  input: CompileNativeNodeInput;
  capability: N8nNativeCapability;
  fragment: N8nNodeFragment;
}

export interface N8nNativeInputConfiguration {
  revision: number;
  /** Omission leaves actual execution values absent; no dummy values are generated. */
  inputValues?: NativeRuntimeInputValues;
}

export type N8nNativeInputSlot = NativeRuntimeInputSlot &
  N8nTemplateInputSlotMapping;

export interface N8nNativeInputTemplate {
  revision: number;
  inputsReady: boolean;
  inputSlots: N8nNativeInputSlot[];
  guide: string;
}

export interface PrepareNativeRuntimeInputsInput {
  nativeNodes: PlannedNativeNode[];
  capabilities: N8nNativeCapability[];
  apiMaterials: ApiBindingMaterial[];
  nativeOutputs: NativeOutputContract[];
  nativeInputs?: N8nNativeInputConfiguration;
}

export interface PreparedNativeRuntimeInputs {
  revision: number;
  inputValues: NativeRuntimeInputValues;
  inputsReady: boolean;
  slots: NativeRuntimeInputSlot[];
  nativeParameters: NativeRuntimeParameterMaterialization[];
  capabilities: N8nNativeCapability[];
}

export interface CreateRuntimeInputNativeCapabilitiesInput {
  capabilities: N8nNativeCapability[];
  slots: NativeRuntimeInputSlot[];
  revision: number;
  inputNodeName: string;
}

export interface AssembleNativeRuntimeInputsInput extends BuildN8nWorkflowInput {
  nativeInputs: PreparedNativeRuntimeInputs;
}

export interface N8nNativeInputCompilationResult {
  workflow: N8nWorkflowJSON;
  nativeInputTemplate: N8nNativeInputTemplate;
}
