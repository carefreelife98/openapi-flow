import type { JsonValue } from './api-arguments.js';
import type { BindingSchema, RequestContainerKind } from './api-bindings.js';
import type { JsonValueObject } from './api-arguments.js';
import type { PlannedNativeNode, WorkflowCapability } from './workflow-plan.js';
import type { DeferredApiInputSlot } from './deferred-api-inputs.js';

export interface NativeRuntimeInputSlot {
  kind: 'native-parameters-input';
  state: 'deferred';
  id: string;
  nodeId: string;
  capability: string;
  targetPointer: string;
  schema: BindingSchema;
  description: string;
}

export interface NativeRuntimeParameterInputSource {
  id: string;
  targetPointer: string;
  containerKinds: Record<string, RequestContainerKind>;
}
export interface NativeRuntimeParameterMaterialization {
  nodeId: string;
  parameters: JsonValueObject;
  schema: BindingSchema;
  inputs: NativeRuntimeParameterInputSource[];
}

export type WorkflowRuntimeInputSlot =
  DeferredApiInputSlot | NativeRuntimeInputSlot;
export type NativeRuntimeInputValues = Record<string, JsonValue>;

export interface CollectNativeRuntimeInputSlotsInput {
  nativeNodes: PlannedNativeNode[];
  capabilities: WorkflowCapability[];
}

export interface InspectNativeRuntimeInputsInput extends CollectNativeRuntimeInputSlotsInput {
  inputValues: NativeRuntimeInputValues;
}

export interface NativeRuntimeInputIssue {
  code: 'missing-input' | 'unknown-input' | 'invalid-value';
  inputId: string;
  nodeId?: string;
  message: string;
}

export interface ReadyNativeRuntimeInputs {
  status: 'ready';
  slots: NativeRuntimeInputSlot[];
  nativeNodes: PlannedNativeNode[];
  issues: NativeRuntimeInputIssue[];
}

export interface PendingNativeRuntimeInputs {
  status: 'needs-input' | 'invalid-input';
  slots: NativeRuntimeInputSlot[];
  issues: NativeRuntimeInputIssue[];
}

export type NativeRuntimeInputInspection =
  ReadyNativeRuntimeInputs | PendingNativeRuntimeInputs;
