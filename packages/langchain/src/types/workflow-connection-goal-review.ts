import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowConnectionSessionInput,
  WorkflowConnectionGoalReviewProposal,
  WorkflowConnectionSessionSource,
  WorkflowReviewedGoalCandidate,
} from '@openapi-flow/core';

export interface ReviewWorkflowConnectionGoalsInput extends WorkflowConnectionSessionInput {
  model: BaseChatModel;
  signal?: AbortSignal;
}
export type WorkflowConnectionGoalReviewAssessment = Omit<
  WorkflowConnectionGoalReviewProposal['assessments'][number],
  'factId'
>;
export interface WorkflowConnectionGoalReviewModelOutput {
  assessments: Record<string, WorkflowConnectionGoalReviewAssessment>;
}
export interface ValidateWorkflowGoalReviewFeedbackInput extends WorkflowConnectionSessionSource {
  rejectedGoalReviews?: WorkflowReviewedGoalCandidate[];
}
