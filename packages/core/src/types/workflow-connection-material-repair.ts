import type { z } from 'zod';
import type {
  workflowConnectionSourceRepairRequestSchema,
  workflowConnectionSourceRepairReceiptSchema,
  workflowConnectionMaterialReplacementSchema,
} from '../schemas/workflow-connection-material-repair-schema.js';
import type { WorkflowConnectionSessionSource } from './workflow-connection-session.js';
import type { ApiCallArguments } from './api-arguments.js';
import type {
  ApiOperationContract,
  ApiOperationObject,
} from './api-operation.js';
import type { JsonObject } from './openapi.js';
import type { PlannedNativeNode } from './workflow-plan.js';
import type { NativeOutputContract } from './node-output.js';
import type { NativePlanningCapabilityMaterial } from './native-node-planning.js';
import type { DeferredApiInputSlot } from './deferred-api-inputs.js';
import type { WorkflowConnectionMaterialRepairTarget } from './workflow-connection-revision.js';
import type { ApiLiteralGenerationInput } from './api-literal-generation.js';

export type WorkflowConnectionArgumentValues = Pick<
  ApiCallArguments,
  | 'values'
  | 'bindings'
  | 'unresolvedInputs'
  | 'requestedInputs'
  | 'requestMediaType'
>;
export interface WorkflowConnectionApiResponseContext extends Pick<
  ApiOperationContract,
  'key' | 'method' | 'path'
> {
  nodeId: string;
  responses: ApiOperationObject['responses'];
}
export interface WorkflowConnectionApiMaterialContext {
  callId: string;
  arguments: WorkflowConnectionArgumentValues;
  requestSchema: JsonObject;
}
export interface WorkflowConnectionNativeMaterialContext {
  node: PlannedNativeNode;
  output: NativeOutputContract | null;
  definition: NativePlanningCapabilityMaterial;
}
export interface WorkflowConnectionConflictMaterials {
  apiCalls: WorkflowConnectionApiMaterialContext[];
  nativeNodes: WorkflowConnectionNativeMaterialContext[];
  apiResponseContracts: WorkflowConnectionApiResponseContext[];
}
export interface WorkflowConnectionMaterialRepairStage {
  stage: WorkflowConnectionMaterialRepairTarget['stage'];
  nodeIds: string[];
}
export interface WorkflowConnectionApiArgumentRepairTask {
  input: ApiLiteralGenerationInput;
  literalInputSchema: JsonObject;
}
/** A description of remaining work, not generated values or an adopted source. */
export interface WorkflowConnectionMaterialRepairWork {
  originalRequest: WorkflowConnectionSourceRepairRequest;
  request: WorkflowConnectionSourceRepairRequest;
  replacementFingerprint: string;
  apiArgumentTasks: WorkflowConnectionApiArgumentRepairTask[];
}
export interface ApplyWorkflowConnectionMaterialRepairWorkInput {
  source: WorkflowConnectionSessionSource;
  work: WorkflowConnectionMaterialRepairWork;
  pendingReplacement: WorkflowConnectionMaterialReplacement;
  replacement: WorkflowConnectionMaterialReplacement;
}
export interface WorkflowConnectionMaterialRepairWorkSubmission extends Omit<
  ApplyWorkflowConnectionMaterialRepairWorkInput,
  'source'
> {
  kind: 'dependent-api-arguments';
}
export interface DescribeWorkflowConnectionConflictMaterialsInput {
  source: WorkflowConnectionSessionSource;
  nodeIds: string[];
}
export type WorkflowConnectionSourceRepairRequest = z.infer<
  typeof workflowConnectionSourceRepairRequestSchema
>;
export type WorkflowConnectionMaterialReplacement = z.infer<
  typeof workflowConnectionMaterialReplacementSchema
>;
export type WorkflowConnectionSourceRepairReceipt = z.infer<
  typeof workflowConnectionSourceRepairReceiptSchema
>;
export interface ApplyWorkflowConnectionMaterialRepairInput {
  source: WorkflowConnectionSessionSource;
  request: WorkflowConnectionSourceRepairRequest;
  replacement: WorkflowConnectionMaterialReplacement;
}
export type ValidateWorkflowConnectionSourceRepairRequestInput = Omit<
  ApplyWorkflowConnectionMaterialRepairInput,
  'replacement'
>;
export interface WorkflowConnectionMaterialRepairResult {
  source: WorkflowConnectionSessionSource;
  receipt: WorkflowConnectionSourceRepairReceipt;
}
/** Inspection is not adoption: graph, binding availability and final readiness still require apply. */
export interface WorkflowConnectionMaterialRepairInputInspection {
  sourceFingerprint: string;
  replacementFingerprint: string;
  slots: DeferredApiInputSlot[];
  retainedDeferredApiInputIds: string[];
  retiredDeferredApiInputIds: string[];
  unapprovedSlots: DeferredApiInputSlot[];
}
export interface PreparedConnectionMaterialReplacement {
  source: WorkflowConnectionSessionSource;
  snapshot: WorkflowConnectionSessionSource;
  request: WorkflowConnectionSourceRepairRequest;
  replacement: WorkflowConnectionMaterialReplacement;
  beforeFingerprint: string;
  slots: DeferredApiInputSlot[];
}
export interface ReplayWorkflowConnectionMaterialRepairInput {
  source: WorkflowConnectionSessionSource;
  receipt: WorkflowConnectionSourceRepairReceipt;
}
