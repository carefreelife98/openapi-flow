import type {
  ReviewableWorkflowApiMaterial,
  ReviewableWorkflowGraphPlan,
  ReviewableWorkflowGraphProposal,
  WorkflowReviewGap,
  BlockedWorkflowCall,
} from './reviewable-workflow.js';
import type {
  PlannedNativeNode,
  WorkflowCapability,
  WorkflowPlanEdge,
  WorkflowPlanNodeContract,
} from './workflow-plan.js';
import type { PreparedNativeNodeMaterial } from './native-node-planning.js';
import type { WorkflowPlanningSourceEvidence } from './workflow-planning-materials.js';

export interface WorkflowConnectionMaterialInput {
  materials?: ReviewableWorkflowApiMaterial[];
  capabilities?: WorkflowCapability[];
  nativeNodes?: PlannedNativeNode[];
  gaps?: WorkflowReviewGap[];
  edges?: WorkflowPlanEdge[];
}

export interface WorkflowConnectionPlanningInput extends WorkflowConnectionMaterialInput {
  scenario: string;
}

export interface WorkflowConnectionMaterials {
  materials: ReviewableWorkflowApiMaterial[];
  capabilities: WorkflowCapability[];
  nativeNodes: PlannedNativeNode[];
  gaps: WorkflowReviewGap[];
  edges: WorkflowPlanEdge[];
  contracts: WorkflowPlanNodeContract[];
}

export interface WorkflowConnectionApiRole {
  callId: string;
  purpose: string;
}

export interface WorkflowNativeParameterReadiness {
  nodeId: string;
  planTimeStatus: 'validated';
  /** Explicit runtime ownership, not missing plan-time values or unresolved graph gaps. */
  executionInputPointers: string[];
}

export interface WorkflowConnectionPlanningContext {
  scenario: string;
  nodes: WorkflowPlanNodeContract[];
  nativeNodes?: PreparedNativeNodeMaterial[];
  nativeParameterReadiness?: WorkflowNativeParameterReadiness[];
  edges: WorkflowPlanEdge[];
  gaps: WorkflowReviewGap[];
  readyCallIds: string[];
  apiRoles: WorkflowConnectionApiRole[];
}

export interface WorkflowConnectionPlanningSnapshot extends WorkflowConnectionMaterials {
  scenario: string;
}

export interface WorkflowConnectionPlanningDescription {
  input: WorkflowConnectionPlanningSnapshot;
  context: WorkflowConnectionPlanningContext;
  sources: WorkflowPlanningSourceEvidence;
}

export type WorkflowConnectionProposal = Omit<
  ReviewableWorkflowGraphProposal,
  'nativeNodes'
>;

export interface ExplainedWorkflowConnection extends WorkflowPlanEdge {
  reason: string;
}

export interface ExplainedWorkflowBlockedCall extends BlockedWorkflowCall {
  reason: string;
}

export interface WorkflowConnectionDecision {
  reason: string;
  edges: ExplainedWorkflowConnection[];
  blockedCalls: ExplainedWorkflowBlockedCall[];
  additionalGaps: ReviewableWorkflowGraphProposal['additionalGaps'];
}

export type WorkflowConnectionPlanningResult = Pick<
  ReviewableWorkflowGraphPlan,
  'nativeNodes' | 'edges' | 'gaps' | 'blockedCalls' | 'starts'
>;

export interface WorkflowConnectionPlanningRecord {
  kind: 'proposed-connections';
  decision: WorkflowConnectionDecision;
  plan: WorkflowConnectionPlanningResult;
  evidence: {
    kind: 'supplied-connection-materials';
    context: WorkflowConnectionPlanningContext;
    sources: WorkflowPlanningSourceEvidence;
  };
  /** Code-derived final contracts, including newly blocked calls and gap placeholders. */
  verification: { contracts: WorkflowPlanNodeContract[] };
}

export interface CreateWorkflowConnectionPlanInput extends WorkflowConnectionPlanningInput {
  proposal: WorkflowConnectionProposal;
}

export interface CreateWorkflowConnectionPlanningRecordInput extends WorkflowConnectionPlanningInput {
  plan: WorkflowConnectionPlanningResult;
  decision: WorkflowConnectionDecision;
}

export interface ValidateWorkflowConnectionPlanningRecordInput extends WorkflowConnectionPlanningInput {
  plan: WorkflowConnectionPlanningResult;
  record: WorkflowConnectionPlanningRecord;
}
