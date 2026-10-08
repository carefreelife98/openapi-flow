import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ReviewableWorkflowApiMaterial,
  PlannedNativeNode,
  WorkflowCapability,
  WorkflowPlanEdge,
  WorkflowReviewGap,
  WorkflowPlanNodeContract,
} from '@openapi-flow/core';

export interface PlanWorkflowConnectionsInput {
  scenario: string;
  model: BaseChatModel;
  materials?: ReviewableWorkflowApiMaterial[];
  capabilities?: WorkflowCapability[];
  nativeNodes?: PlannedNativeNode[];
  gaps?: WorkflowReviewGap[];
  edges?: WorkflowPlanEdge[];
}

export interface OrchestrateWorkflowInput extends Omit<
  PlanWorkflowConnectionsInput,
  'nativeNodes'
> {
  workflowId: string;
  preparedNativeNodes?: PlannedNativeNode[];
}

export interface WorkflowConnectionMaterials {
  materials: ReviewableWorkflowApiMaterial[];
  capabilities: WorkflowCapability[];
  nativeNodes: PlannedNativeNode[];
  gaps: WorkflowReviewGap[];
  edges: WorkflowPlanEdge[];
  contracts: WorkflowPlanNodeContract[];
}
