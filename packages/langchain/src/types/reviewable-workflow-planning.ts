import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ReviewableWorkflowGraphProposal,
  ReviewableWorkflowPlanningContext,
  WorkflowReviewGap,
  PlannedNativeNode,
  ExplainedWorkflowConnection,
  ExplainedWorkflowBlockedCall,
} from '@openapi-flow/core';
import type { ExplainedGraphNativeNode } from './workflow-planning.js';

export interface PlanReviewableWorkflowGraphInput extends ReviewableWorkflowPlanningContext {
  scenario: string;
  model: BaseChatModel;
  gaps: WorkflowReviewGap[];
  preparedNativeNodes?: PlannedNativeNode[];
  includeExplanations?: boolean;
}

export type ReviewableWorkflowGraphPlanningFailure =
  | { stage: 'proposal-schema'; output: unknown }
  | { stage: 'graph-validation'; output: ReviewableWorkflowGraphModelOutput };

export type ReviewableWorkflowGraphOutput = Omit<
  ReviewableWorkflowGraphProposal,
  'nativeNodes' | 'blockedCalls'
> & {
  additionalNativeNodes?: ReviewableWorkflowGraphProposal['nativeNodes'];
  blockedCalls?: ReviewableWorkflowGraphProposal['blockedCalls'];
};

export interface ExplainedReviewableWorkflowGraphOutput extends ReviewableWorkflowGraphOutput {
  reason: string;
  additionalNativeNodes?: ExplainedGraphNativeNode[];
  edges: ExplainedWorkflowConnection[];
  blockedCalls?: ExplainedWorkflowBlockedCall[];
}

export type ReviewableWorkflowGraphModelOutput =
  ReviewableWorkflowGraphOutput | ExplainedReviewableWorkflowGraphOutput;
