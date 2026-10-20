import type { ApiOperationContract } from './api-operation.js';
import type { ApiOperationKey } from './api-catalog.js';
import type { ApiArgumentValues, OutputBinding } from './api-arguments.js';
import type {
  WorkflowCapability,
  PlannedNativeNode,
  WorkflowPlanEdge,
} from './workflow-plan.js';
import type {
  DeferredApiInputMaterial,
  DeferredApiInputSlot,
} from './deferred-api-inputs.js';
import type {
  NativeRuntimeInputSlot,
  WorkflowRuntimeInputSlot,
} from './native-runtime-inputs.js';
import type {
  WorkflowDraftClarification,
  WorkflowDraftRequirementOrigin,
} from './workflow-draft-clarification.js';
import type { WorkflowEntryPointContract } from './planning-evidence.js';
import type { WorkflowDraftRequirementHistoryEntry } from './workflow-draft-requirement-history.js';
import type { WorkflowDraftCapabilityGap } from './workflow-draft-capability-gap.js';

export interface WorkflowDraftApiCall {
  id: string;
  requestedInputs?: string[];
  operation: ApiOperationKey;
  values: ApiArgumentValues;
  bindings: OutputBinding[];
  requestMediaType?: string;
}

export type WorkflowDraftNode =
  WorkflowDraftApiCall | PlannedNativeNode | WorkflowDraftCapabilityGap;

export type WorkflowDraftScope =
  { kind: 'workflow' } | { kind: 'nodes'; nodeIds: string[] };

export interface WorkflowDraftRequirement {
  id: string;
  text: string;
  state: 'confirmed' | 'needs-clarification' | 'deferred';
  scope: WorkflowDraftScope;
  sourceMessageIds: string[];
  /** Creation lineage; current sources and code-owned requirementHistory retain later revisions separately. */
  origin?: WorkflowDraftRequirementOrigin;
}

export interface WorkflowSourceMessage {
  id: string;
  text: string;
}

export interface WorkflowDraftApproval {
  id: string;
  revision: number;
  nodeIds: string[];
  invalidatedNodeIds: string[];
}

export interface WorkflowDraftContent {
  id: string;
  requirements: WorkflowDraftRequirement[];
  apiCalls: WorkflowDraftApiCall[];
  nativeNodes: PlannedNativeNode[];
  /** Explicit unresolved roles, not native capabilities or fabricated OAS operations. */
  gapNodes?: WorkflowDraftCapabilityGap[];
  edges: WorkflowPlanEdge[];
}

export interface WorkflowDraft extends WorkflowDraftContent {
  revision: number;
  approvals: WorkflowDraftApproval[];
  requirementHistory: WorkflowDraftRequirementHistoryEntry[];
}

export interface WorkflowDraftContext {
  operations: ApiOperationContract[];
  capabilities: WorkflowCapability[];
  messages: WorkflowSourceMessage[];
  /** Explicit active evidence view. Omission permits all supplied messages, including caller-owned history. */
  planningMessageIds?: string[];
  entrypoint?: WorkflowEntryPointContract;
  clarification?: WorkflowDraftClarification;
}

export interface CreateWorkflowDraftInput {
  content: WorkflowDraftContent;
  context: WorkflowDraftContext;
}

export interface WorkflowDraftInput {
  draft: WorkflowDraft;
  context: WorkflowDraftContext;
}
export interface ResolveWorkflowDraftApiMaterialsInput {
  content: WorkflowDraftContent;
  context: WorkflowDraftContext;
}

export interface WorkflowDraftMaterials {
  materials: DeferredApiInputMaterial[];
  slots: DeferredApiInputSlot[];
  nativeSlots: NativeRuntimeInputSlot[];
}

export interface WorkflowDraftNodeReadiness {
  nodeId: string;
  planningStatus: 'ready' | 'blocked-by-decision' | 'blocked-by-capability';
  requestInputStatus:
    'ready' | 'needs-input' | 'blocked-by-decision' | 'blocked-by-capability';
  runtimeInputStatus:
    'ready' | 'needs-input' | 'blocked-by-decision' | 'blocked-by-capability';
  blockingGapNodeIds?: string[];
  unresolvedRequirementIds: string[];
  inputSlotIds: string[];
  dependencyNodeIds: string[];
  reviewed: boolean;
}

export interface WorkflowDraftReadiness {
  designReady: boolean;
  requestInputsReady: boolean;
  nativeInputsReady: boolean;
  runtimeInputsReady: boolean;
  reviewed: boolean;
  nodes: WorkflowDraftNodeReadiness[];
  slots: WorkflowRuntimeInputSlot[];
}

export interface ApproveWorkflowDraftInput extends WorkflowDraftInput {
  expectedRevision: number;
  nodeIds: string[];
}
