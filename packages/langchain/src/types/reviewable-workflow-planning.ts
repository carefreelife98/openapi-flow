import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ReviewableWorkflowGraphProposal,
  ReviewableWorkflowPlanningContext,
  WorkflowReviewGap,
  PlannedNativeNode,
} from '@openapi-flow/core';

export interface PlanReviewableWorkflowGraphInput extends ReviewableWorkflowPlanningContext {
  scenario: string;
  model: BaseChatModel;
  gaps: WorkflowReviewGap[];
  preparedNativeNodes?: PlannedNativeNode[];
}

export type ReviewableWorkflowGraphPlanningFailure =
  | { stage: 'proposal-schema'; output: unknown }
  | { stage: 'graph-validation'; output: ReviewableWorkflowGraphOutput };

export type ReviewableWorkflowGraphOutput = Omit<
  ReviewableWorkflowGraphProposal,
  'nativeNodes' | 'blockedCalls'
> & {
  additionalNativeNodes?: ReviewableWorkflowGraphProposal['nativeNodes'];
  blockedCalls?: ReviewableWorkflowGraphProposal['blockedCalls'];
};
