import type { ApiOperationContract } from './api-operation.js';
import type { ApiOperationKey } from './api-catalog.js';
import type { OutputBinding } from './api-arguments.js';
import type {
  WorkflowApiMaterial,
  WorkflowCapability,
  WorkflowGraphPlan,
  PlannedNativeNode,
  WorkflowPlanEdge,
} from './workflow-plan.js';

export interface WorkflowReviewGap {
  id: string;
  stage: 'api-selection' | 'api-bindings' | 'workflow-graph';
  description: string;
  operation?: ApiOperationKey;
  callId?: string;
  targetPointer?: string;
}

export interface ReadyWorkflowApiMaterial extends WorkflowApiMaterial {
  status: 'ready';
}

export interface BlockedWorkflowApiMaterial {
  status: 'blocked';
  callId: string;
  operation: ApiOperationContract;
  requestMediaType?: string;
  bindings: OutputBinding[];
  gapIds: string[];
}

export type ReviewableWorkflowApiMaterial =
  ReadyWorkflowApiMaterial | BlockedWorkflowApiMaterial;

export interface BlockedWorkflowCall {
  callId: string;
  gapIds: string[];
}

export interface ProposedWorkflowGap {
  id: string;
  description: string;
}

export interface ReviewableWorkflowGraphProposal {
  nativeNodes: PlannedNativeNode[];
  edges: WorkflowPlanEdge[];
  additionalGaps: ProposedWorkflowGap[];
  blockedCalls: BlockedWorkflowCall[];
}

export interface ReviewableWorkflowGraphPlan extends WorkflowGraphPlan {
  gaps: WorkflowReviewGap[];
  blockedCalls: BlockedWorkflowCall[];
}

export interface ReviewableWorkflowPlanningContext {
  materials: ReviewableWorkflowApiMaterial[];
  capabilities: WorkflowCapability[];
}

export interface CreateReviewableWorkflowGraphPlanInput extends ReviewableWorkflowPlanningContext {
  gaps: WorkflowReviewGap[];
  proposal: ReviewableWorkflowGraphProposal;
}

export interface ValidateReviewableWorkflowGraphPlanInput extends ReviewableWorkflowPlanningContext {
  plan: ReviewableWorkflowGraphPlan;
}
