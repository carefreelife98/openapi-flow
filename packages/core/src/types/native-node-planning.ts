import type { ApiBindingMaterial } from './api-bindings.js';
import type { z } from 'zod';
import type { JsonValueObject } from './api-arguments.js';
import type { JsonObject } from './openapi.js';
import type { BindingSchema } from './api-bindings.js';
import type { NativeOutputContract } from './node-output.js';
import type {
  NativeInstanceDependencyPlan,
  NativeNodeConfigurationDependencies,
} from './native-instance-dependencies.js';
import type {
  WorkflowNativeMaterialSources,
  MissingWorkflowNativeMaterialRequirement,
  ResolveNativeMaterialSnapshotInput,
} from './native-material-snapshot.js';
import type { WorkflowReviewGap } from './reviewable-workflow.js';
import type {
  PlannedNativeNode,
  WorkflowCapability,
  WorkflowPlanGap,
  WorkflowPlanNodeContract,
  NativeRuntimeParameterSelection,
} from './workflow-plan.js';

export interface NativeNodePlanningInput {
  planId: string;
  scenario: string;
  capabilities?: WorkflowCapability[];
  apiMaterials?: ApiBindingMaterial[];
  preparedNativeNodes?: PlannedNativeNode[];
  allowRuntimeParameters?: boolean;
}

export interface NativePlanningCapabilityMaterial {
  name: string;
  description: string;
  parametersSchema: BindingSchema;
  parameterReferenceSources?: WorkflowCapability['parameterReferenceSources'];
  parameterSources: ('literal' | 'workflow-input' | 'workflow-fields')[];
  materialRequirements?: WorkflowCapability['materialRequirements'];
  materialSources?: WorkflowNativeMaterialSources;
}

export interface PreparedNativeNodeMaterial extends PlannedNativeNode {
  inputPorts: string[];
  outputPorts: string[];
}

export interface NativePlanningApiMaterial {
  callId: string;
  purpose?: string;
  key: ApiBindingMaterial['operation']['key'];
  method: string;
  path: string;
  operation: ApiBindingMaterial['operation']['operation'];
  effective: ApiBindingMaterial['operation']['effective'];
}

export interface NativeNodePlanningContext {
  scenario: string;
  apiMaterials: NativePlanningApiMaterial[];
  preparedNativeNodes: PreparedNativeNodeMaterial[];
  capabilities: NativePlanningCapabilityMaterial[];
}

export interface NativeNodePlanningDescription {
  input: NativeNodePlanningSnapshot;
  context: NativeNodePlanningContext;
  planningCapabilities: WorkflowCapability[];
}

export interface NativeNodePlanningSnapshot extends NativeNodePlanningInput {
  capabilities: WorkflowCapability[];
  apiMaterials: ApiBindingMaterial[];
  preparedNativeNodes: PlannedNativeNode[];
}

export interface NativePlanningProposal {
  nativeNodes: PlannedNativeNode[];
  gaps: WorkflowPlanGap[];
}

export interface NativePlanningResult {
  /** Only newly proposed instances, not supplied prepared instances. */
  nativeNodes: PlannedNativeNode[];
  gaps: WorkflowReviewGap[];
}

export interface CreateNativeNodePlanInput extends NativeNodePlanningInput {
  proposal: NativePlanningProposal;
}

export interface NativePlanningNodeReason {
  nodeId: string;
  reason: string;
}

export type NativePlanningAssessment =
  | { kind: 'additions'; nodes: NativePlanningNodeReason[] }
  | { kind: 'no-additions'; reason: string };

export interface NativePlanningVerification {
  /** Derived after parameter validation; these are not invented model-visible schemas. */
  contracts: WorkflowPlanNodeContract[];
  outputs: NativeOutputContract[];
}

export interface NativePlanningRecordFields {
  planId: string;
  plan: NativePlanningResult;
  evidence: {
    kind: 'native-planning-context';
    context: NativeNodePlanningContext;
  };
  verification: NativePlanningVerification;
}

export type NativeNodePlanningRecord = NativePlanningRecordFields &
  (
    | { kind: 'no-capabilities' }
    | { kind: 'model-plan'; assessment: NativePlanningAssessment }
  );

export interface CreateNativeNodePlanningRecordInput extends NativeNodePlanningInput {
  plan: NativePlanningResult;
  assessment?: NativePlanningAssessment;
}

export interface ValidateNativeNodePlanningRecordInput extends NativeNodePlanningInput {
  plan: NativePlanningResult;
  record: NativeNodePlanningRecord;
}

export type NativeInstanceOwnership =
  | { parameterSource: 'literal' }
  | { parameterSource: 'workflow-input' }
  | { parameterSource: 'workflow-fields'; pointers: string[] };

export type NativeInstanceChoice = NativeInstanceOwnership & {
  capability: string;
  purpose: string;
  reason?: string;
};

export interface NativeInstanceSelectionProposal {
  instances: NativeInstanceChoice[];
  gaps: WorkflowPlanGap[];
  reason?: string;
}

export interface NativeInstanceSelectionInput extends NativeNodePlanningInput {
  includeExplanations?: boolean;
}

export interface SelectedNativeInstance {
  id: string;
  capability: string;
  purpose: string;
  reason?: string;
  literalParametersSchema: BindingSchema;
  hasLiteralParameters: boolean;
  runtimeParameters?: true | NativeRuntimeParameterSelection;
}

export interface NativeInstanceSelection {
  id: string;
  proposal: NativeInstanceSelectionProposal;
  context: NativeInstanceSelectionContext;
  includeExplanations: boolean;
  instances: SelectedNativeInstance[];
  gaps: WorkflowReviewGap[];
}

export interface NativeInstanceSelectionContext extends NativeNodePlanningContext {
  parameterPlanning: {
    stage: 'separate-value-generation';
    missingPlanTimeValues: 'ask-in-value-stage';
  };
}

export interface NativeInstanceSelectionDescription extends Omit<
  NativeNodePlanningDescription,
  'context'
> {
  context: NativeInstanceSelectionContext;
}

export interface ResolveNativeInstanceSelectionInput extends NativeInstanceSelectionInput {
  proposal: NativeInstanceSelectionProposal;
}

export interface NativeSelectedPlanningInput extends NativeInstanceSelectionInput {
  selection: NativeInstanceSelection;
}

export interface NativeNodeConfigurationInput extends NativeSelectedPlanningInput {
  nodeId: string;
  /** Optional explicit producer choices, checked independently of runtime DAG edges. */
  dependencies?: NativeInstanceDependencyPlan;
  /** Explicit completed materials, never inferred from the selection order. */
  configuredNodes?: PlannedNativeNode[];
  /** Ordered answers to original questions from this exact instance/material revision. */
  replies?: NativeNodeConfigurationReply[];
}

export interface NativeParameterGenerationInput {
  nodeId: string;
  capability: WorkflowCapability;
  runtimeParameters?: true | NativeRuntimeParameterSelection;
}

export interface NativeParameterGenerationContract {
  literalParametersSchema: BindingSchema;
  valuesSchema: z.ZodType<JsonValueObject>;
  definitions: JsonObject;
  hasLiteralParameters: boolean;
}

export type NativeNodeParameterDecision =
  | { status: 'provided'; parameters: JsonValueObject; reason?: string }
  | { status: 'needs-clarification'; message: string; reason?: string };

export interface NativeNodeParameterProposal {
  decision: NativeNodeParameterDecision;
}

export interface NativeNodeConfigurationDescription {
  fingerprint: string;
  context: NativeInstanceSelectionContext;
  instance: SelectedNativeInstance;
  configuredNodes: PreparedNativeNodeMaterial[];
  outputs: NativeOutputContract[];
  replies?: NativeNodeConfigurationReply[];
  sourceDependencies?: NativeNodeConfigurationDependencies;
}

export interface NativeConfigurationMaterialContext {
  selection: NativeInstanceSelection;
  instance: SelectedNativeInstance;
  snapshot: NativeNodePlanningSnapshot;
  capabilities: WorkflowCapability[];
  configuredNodes: PlannedNativeNode[];
  outputs: NativeOutputContract[];
  definition: WorkflowCapability;
  sourceDependencies?: NativeNodeConfigurationDependencies;
}

export interface ResolvedNativeConfigurationMaterials extends NativeConfigurationMaterialContext {
  capability: WorkflowCapability;
  contract: NativeParameterGenerationContract;
}

export type ResolveNativePlanningMaterialsInput = Omit<
  ResolveNativeMaterialSnapshotInput,
  'deferredNodeIds' | 'shouldDeferNode'
>;

export interface ResolvedNativePlanningMaterials {
  capabilities: WorkflowCapability[];
  outputs: NativeOutputContract[];
}

export type NativeNodeConfigurationReadiness =
  | { status: 'ready'; nodeId: string }
  | {
      status: 'awaiting-materials';
      nodeId: string;
      capability: string;
      missingContext: MissingWorkflowNativeMaterialRequirement[];
      pendingSourceNodeIds?: string[];
    };

export interface ResolveNativeNodeParametersInput extends NativeNodeConfigurationInput {
  fingerprint: string;
  proposal: NativeNodeParameterProposal;
}

export interface ReadyNativeNodeParameters {
  status: 'ready';
  fingerprint: string;
  node: PlannedNativeNode;
  proposal: NativeNodeParameterProposal;
}

export interface NativeNodeParameterQuestion {
  status: 'needs-clarification';
  id: string;
  fingerprint: string;
  nodeId: string;
  message: string;
  proposal: NativeNodeParameterProposal;
}

export interface NativeNodeConfigurationReply {
  question: NativeNodeParameterQuestion;
  text: string;
}

export type NativeNodeParameterResult =
  ReadyNativeNodeParameters | NativeNodeParameterQuestion;
