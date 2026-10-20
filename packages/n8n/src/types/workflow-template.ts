import type {
  WorkflowDraft,
  WorkflowDraftContext,
  WorkflowDraftReadiness,
  DeferredApiInputSlot,
  DeferredApiInputValues,
  WorkflowApiMaterial,
  WorkflowGraphPlan,
  ApiOperationContract,
  NativeRuntimeInputSlot,
  WorkflowRuntimeInputSlot,
  NativeRuntimeParameterMaterialization,
  WorkflowDraftCapabilityGap,
} from '@openapi-flow/core';
import type { N8nNativeCapability } from './native-capability.js';
import type { N8nNodeFragment } from './node-fragment.js';
import type { HttpRequestDeploymentOptions } from './request-deployment.js';
import type { RequestMaterializationConfig } from './request-materialization.js';
import type { N8nWorkflowJSON } from './workflow-compilation.js';

export interface N8nTemplateDeployment extends HttpRequestDeploymentOptions {
  documentId: string;
}
export interface SelectN8nTemplateDeploymentsInput {
  deployments: N8nTemplateDeployment[];
  availableDocumentIds: string[];
  selectedDocumentIds: string[];
}
export interface N8nTemplateContext extends Omit<
  WorkflowDraftContext,
  'capabilities'
> {
  capabilities: N8nNativeCapability[];
}
export interface CompileN8nWorkflowTemplateInput {
  draft: WorkflowDraft;
  context: N8nTemplateContext;
  name: string;
  /** Resolve each request's declared references by actual n8n item ancestry. */
  itemMode?: 'linked';
  deployments?: N8nTemplateDeployment[];
  /** Only explicit actual values; omission means no supplied runtime values. */
  inputValues?: DeferredApiInputValues;
}
export interface N8nTemplateNodeMappingBase {
  nodeId: string;
  sdkNodeIds: string[];
  entryNodeName: string;
  exitNodeName: string;
}
export interface N8nTemplateApiNodeMapping extends N8nTemplateNodeMappingBase {
  kind: 'api';
  operation: N8nTemplateOperationMapping;
}
export interface N8nTemplateOperationMapping extends Pick<
  ApiOperationContract,
  'key' | 'method' | 'path'
> {
  summary?: string;
}
export interface N8nTemplateNativeNodeMapping extends N8nTemplateNodeMappingBase {
  kind: 'native';
  capability: string;
}
export type N8nTemplateNodeMapping =
  | N8nTemplateApiNodeMapping
  | N8nTemplateNativeNodeMapping
  | N8nTemplateGapNodeMapping;
export interface N8nTemplateGapNodeMapping extends N8nTemplateNodeMappingBase {
  kind: 'capability-gap';
  gap: WorkflowDraftCapabilityGap;
  inventoryCurrent: boolean;
}
export interface N8nTemplateInputSlotMapping {
  editNodeId: string;
  editNodeName: string;
  editParameter: 'jsCode';
  materializerNodeName: string;
}
export type N8nTemplateInputSlot = WorkflowRuntimeInputSlot &
  N8nTemplateInputSlotMapping;
export interface N8nTemplateDeploymentRequirement {
  callId: string;
  documentId: string;
  fields: string[];
  materializerNodeName: string;
  requestNodeName: string;
}
export interface N8nWorkflowTemplateResult {
  revision: number;
  workflow: N8nWorkflowJSON;
  /** Canonical draft state, separate from supplied execution-time values. */
  draftReadiness: WorkflowDraftReadiness;
  requestInputsReady: boolean;
  nativeInputsReady: boolean;
  runtimeInputsReady: boolean;
  /** References supplied, not proof of access to the user's n8n credentials. */
  deploymentConfigured: boolean;
  triggerConnected: boolean;
  inputSlots: N8nTemplateInputSlot[];
  deploymentRequirements: N8nTemplateDeploymentRequirement[];
  nodeMappings: N8nTemplateNodeMapping[];
  guide: string;
}
export interface CreateTemplateInputNodesInput {
  revision: number;
  slots: WorkflowRuntimeInputSlot[];
  inputValues: DeferredApiInputValues;
  requests: RequestMaterializationConfig[];
  nativeParameters: NativeRuntimeParameterMaterialization[];
}
export interface CreateTemplateGuideInput {
  draft: WorkflowDraft;
  readiness: WorkflowDraftReadiness;
  slots: N8nTemplateInputSlot[];
  mappings: N8nTemplateNodeMapping[];
  deploymentRequirements: N8nTemplateDeploymentRequirement[];
  requestInputsReady: boolean;
  nativeInputsReady: boolean;
  triggerConnected: boolean;
}
export interface PrepareTemplateApiFragmentsInput {
  template: CompileN8nWorkflowTemplateInput;
  /** Runtime-bound compilers, separate from original planning/evidence context. */
  capabilities: N8nNativeCapability[];
  materials: WorkflowApiMaterial[];
  slots: DeferredApiInputSlot[];
  plan: WorkflowGraphPlan;
}
export interface PreparedTemplateApiFragments {
  apiNodes: N8nNodeFragment[];
  requests: RequestMaterializationConfig[];
  deploymentRequirements: N8nTemplateDeploymentRequirement[];
}
export interface CreateTemplateArtifactMappingInput {
  context: WorkflowDraftContext;
  draft: WorkflowDraft;
  materials: WorkflowApiMaterial[];
  fragments: N8nNodeFragment[];
  slots: (DeferredApiInputSlot | NativeRuntimeInputSlot)[];
}
export interface TemplateArtifactMapping {
  mappings: N8nTemplateNodeMapping[];
  inputSlots: N8nTemplateInputSlot[];
}
