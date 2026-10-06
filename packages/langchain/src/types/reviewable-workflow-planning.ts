import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ReviewableWorkflowGraphProposal,
  ReviewableWorkflowPlanningContext,
  WorkflowReviewGap,
} from '@openapi-flow/core';

export interface PlanReviewableWorkflowGraphInput extends ReviewableWorkflowPlanningContext {
  scenario: string;
  model: BaseChatModel;
  gaps: WorkflowReviewGap[];
}

export type ReviewableWorkflowGraphPlanningFailure =
  | { stage: 'proposal-schema'; output: unknown }
  | { stage: 'graph-validation'; output: ReviewableWorkflowGraphProposal };
