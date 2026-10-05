import type { z } from 'zod';
import type {
  PlannedNativeNode,
  WorkflowCapability,
  WorkflowGraphPlan,
  WorkflowApiMaterial,
} from '@openapi-flow/core';
import type { N8nNodeFragment } from './node-fragment.js';
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

export interface CompileNativeNodeInput {
  planned: PlannedNativeNode;
  apiNodeNames: Record<string, string>;
  position: [number, number];
}

export interface N8nNativeCapability extends WorkflowCapability {
  compile: (input: CompileNativeNodeInput) => N8nNodeFragment;
}

export interface CompilePlannedN8nWorkflowInput {
  id: string;
  name: string;
  plan: WorkflowGraphPlan;
  materials: WorkflowApiMaterial[];
  apiNodes: N8nNodeFragment[];
  capabilities: N8nNativeCapability[];
}
