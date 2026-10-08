import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ApiBindingMaterial,
  PlannedNativeNode,
  WorkflowCapability,
  WorkflowPlanGap,
  WorkflowReviewGap,
} from '@openapi-flow/core';

export interface PlanNativeNodesInput {
  planId: string;
  scenario: string;
  model: BaseChatModel;
  capabilities?: WorkflowCapability[];
  apiMaterials?: ApiBindingMaterial[];
  preparedNativeNodes?: PlannedNativeNode[];
}

export interface NativeNodeProposal {
  nativeNodes: PlannedNativeNode[];
  gaps: WorkflowPlanGap[];
}

export interface NativeNodePlan {
  nativeNodes: PlannedNativeNode[];
  gaps: WorkflowReviewGap[];
}

export type NativeNodePlanningFailure =
  | { stage: 'proposal-schema'; output: unknown }
  | { stage: 'node-validation'; output: NativeNodeProposal };
