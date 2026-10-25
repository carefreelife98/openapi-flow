import type { z } from 'zod';
import type { ApiOperationContract } from './api-operation.js';
import type { ApiCallArguments, JsonValueObject } from './api-arguments.js';
import type { BindingSchema } from './api-bindings.js';
import type { WorkflowCapabilityPlanningContext } from './workflow-capability-planning.js';
import type {
  WorkflowNativeReferenceBinding,
  WorkflowNativeParameterReference,
} from './native-parameter-reference.js';
import type { WorkflowGraphPlanningRecord } from './workflow-graph-planning.js';
import type { WorkflowUnresolvedNode } from './workflow-draft-capability-gap.js';
import type {
  WorkflowNativeMaterialSources,
  WorkflowNativeMaterialRequirement,
} from './native-material-snapshot.js';

export interface WorkflowApiMaterial {
  operation: ApiOperationContract;
  arguments: ApiCallArguments;
  purpose?: string;
}

export interface WorkflowResponseReference {
  source: 'response';
  nodeId: string;
  /** RFC 6901 pointer into the API response body, not n8n's envelope. */
  pointer: string;
}

export interface WorkflowNodeOutputReference {
  source: 'node-output';
  nodeId: string;
  /** RFC 6901 pointer into the declared native JSON item. */
  pointer: string;
}

export type WorkflowValueReference =
  WorkflowResponseReference | WorkflowNodeOutputReference;

export interface WorkflowCapability {
  name: string;
  description: string;
  parametersSchema: z.ZodType<JsonValueObject>;
  /** Supported parameter-reference kinds, not execution predecessors. Required by producer-choice planning; [] declares no references. */
  parameterReferenceSources?: WorkflowNativeParameterReference['source'][];
  /** Opt-in: ports, references and output schema do not depend on parameter values. */
  supportsRuntimeParameters?: true;
  /** Optional generation contract specialized by the capability, never by field-name guessing. */
  createPlanningParametersSchema?: (
    context: WorkflowCapabilityPlanningContext,
  ) => z.ZodType<JsonValueObject>;
  inputPorts: (parameters: JsonValueObject) => string[];
  outputPorts: (parameters: JsonValueObject) => string[];
  responseReferences: (
    parameters: JsonValueObject,
  ) => WorkflowResponseReference[];
  /** Native provenance required by this implementation, never inferred from values. */
  nodeOutputReferences?: (
    parameters: JsonValueObject,
  ) => WorkflowNodeOutputReference[];
  /** Locations of actual API/native/control references in this implementation's parameters. */
  parameterReferenceBindings?: (
    parameters: JsonValueObject,
  ) => WorkflowNativeReferenceBinding[];
  /** Explicit structural contract for inspecting unresolved references, never execution readiness. */
  referenceStructureSchema?: z.ZodType<JsonValueObject>;
  /** Captured source receipts and an explicit pure binding step for a new material revision. */
  materialSources?: WorkflowNativeMaterialSources;
  /** Declared constructor prerequisites, not inferred workflow dependencies or execution order. */
  materialRequirements?: WorkflowNativeMaterialRequirement[];
  bindMaterialContracts?: (
    sources: WorkflowNativeMaterialSources,
  ) => WorkflowCapability;
  /** Dependencies required on a specific incoming port, before a join combines routes. */
  inputReferences?: (
    parameters: JsonValueObject,
  ) => Record<string, WorkflowValueReference[]>;
  waitsForAllInputs: boolean;
  exclusiveOutputPorts: boolean;
  /** Rejoin alternatives from this declared exclusive producer, not independent branches. */
  rejoinsExclusiveOutputs?: (parameters: JsonValueObject) => string;
  /** Explicit native JSON output contract; absent means no bindable output. */
  outputSchema?: (parameters: JsonValueObject) => BindingSchema;
}

export interface NativeRuntimeParameterSelection {
  pointers: string[];
}

export interface PlannedNativeNode {
  id: string;
  capability: string;
  parameters: JsonValueObject;
  /** Explicit runtime ownership of the whole parameter object; parameters must be {}. */
  // A pointer selection instead retains the literals outside its declared fields.
  runtimeParameters?: true | NativeRuntimeParameterSelection;
}

export interface WorkflowPlanEdge {
  from: string;
  output: string;
  to: string;
  input: string;
}

export interface WorkflowPlanGap {
  description: string;
}

export interface WorkflowGraphProposal {
  nativeNodes: PlannedNativeNode[];
  edges: WorkflowPlanEdge[];
  gaps: WorkflowPlanGap[];
}

export interface WorkflowGraphPlan extends WorkflowGraphProposal {
  starts: string[];
  /** Optional original combined native/connection decision, not executable node data. */
  graphPlanning?: WorkflowGraphPlanningRecord;
}

export interface CreateWorkflowGraphPlanInput {
  proposal: WorkflowGraphProposal;
  materials: WorkflowApiMaterial[];
  capabilities: WorkflowCapability[];
}

export interface ValidateWorkflowGraphPlanInput {
  /** Structural unresolved roles; strict compilers do not supply these. */
  unresolvedNodes?: WorkflowUnresolvedNode[];
  plan: WorkflowGraphPlan;
  materials: WorkflowApiMaterial[];
  capabilities: WorkflowCapability[];
}

export interface WorkflowRouteState {
  branches: Map<string, string>;
  completed: Set<string>;
}
/** Internal analysis evidence; the existing public WorkflowRouteState remains compatible. */
export interface WorkflowTopologyRouteState extends WorkflowRouteState {
  traversedOutputs: Map<string, Set<string>>;
}
export type WorkflowTopologyRoutes = Map<string, WorkflowTopologyRouteState[]>;

export interface WorkflowPlanNodeContract {
  id: string;
  inputs: string[];
  outputs: string[];
  references: WorkflowValueReference[];
  inputReferences?: Record<string, WorkflowValueReference[]>;
  dependencyNodeIds: string[];
  waitsForAllInputs: boolean;
  exclusiveOutputPorts: boolean;
  rejoinsExclusiveOutputs?: string;
}

export interface WorkflowNodeContractsInput {
  unresolvedNodes?: WorkflowUnresolvedNode[];
  materials: WorkflowApiMaterial[];
  nativeNodes: PlannedNativeNode[];
  capabilities: WorkflowCapability[];
}

export interface ValidateWorkflowTopologyInput {
  contracts: WorkflowPlanNodeContract[];
  apiIds: Set<string>;
  edges: WorkflowPlanEdge[];
  starts: string[];
}

export interface ValidateWorkflowEdgesInput {
  contracts: WorkflowPlanNodeContract[];
  edges: WorkflowPlanEdge[];
}
