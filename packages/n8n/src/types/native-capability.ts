import type { z } from 'zod';
import type {
  PlannedNativeNode,
  WorkflowCapability,
  WorkflowGraphPlan,
  WorkflowApiMaterial,
  ApiOperationContract,
  WorkflowNativeMaterialSources,
} from '@openapi-flow/core';
import type { N8nNodeFragment } from './node-fragment.js';
import type {
  N8nNativeRuntimeInput,
  N8nNativeInputConfiguration,
} from './native-runtime-parameters.js';
import type { N8nNativeOutputSource } from './output-binding-source.js';
import type {
  nativeOperandSchema,
  nativeCheckSchema,
  ifParametersSchema,
  mergeParametersSchema,
  assertionParametersSchema,
  stopParametersSchema,
} from '../schemas/native-capability-schemas.js';

export type NativeOperand = z.infer<typeof nativeOperandSchema>;
export type NativeCheck = z.infer<typeof nativeCheckSchema>;
export type IfParameters = z.infer<typeof ifParametersSchema>;
export type MergeParameters = z.infer<typeof mergeParametersSchema>;
export type AssertionParameters = z.infer<typeof assertionParametersSchema>;
export type StopParameters = z.infer<typeof stopParametersSchema>;

export interface NativeItemExecutionOptions {
  itemMode?: 'linked';
}

export interface CompileNativeNodeInput {
  planned: PlannedNativeNode;
  apiNodeNames: Record<string, string>;
  position: [number, number];
  /** Original OAS contracts are required by compilers that read API responses. */
  apiResponseContracts?: Record<string, ApiOperationContract>;
  /** Compiler proof from a single Manual Trigger item and item-preserving API paths. Missing/unknown proofs retain ancestry reads. */
  singletonApiResponseIds?: string[];
  runtimeInput?: N8nNativeRuntimeInput;
  /** Names/schemas of actual already-compiled native producers, never guessed from IDs. */
  nativeOutputSources?: N8nNativeOutputSource[];
}

export interface N8nNativeCapability extends WorkflowCapability {
  bindMaterialContracts?: (
    sources: WorkflowNativeMaterialSources,
  ) => N8nNativeCapability;
  compile: (input: CompileNativeNodeInput) => N8nNodeFragment;
}

export interface CreateJsonOutputCapabilityInput {
  name: string;
  description: string;
  parametersSchema: WorkflowCapability['parametersSchema'];
}

export interface CompilePlannedN8nWorkflowInput {
  id: string;
  name: string;
  plan: WorkflowGraphPlan;
  materials: WorkflowApiMaterial[];
  apiNodes: N8nNodeFragment[];
  capabilities: N8nNativeCapability[];
  nativeInputs?: N8nNativeInputConfiguration;
}

export type CompileNativeWorkflowNodesInput = Pick<
  CompilePlannedN8nWorkflowInput,
  'plan' | 'apiNodes' | 'capabilities' | 'materials'
>;
