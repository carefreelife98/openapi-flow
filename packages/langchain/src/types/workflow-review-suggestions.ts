import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowReviewSuggestionsInput,
  WorkflowReviewSuggestionsProposal,
  WorkflowReviewQuestionEvidence,
} from '@openapi-flow/core';
import type { ProposedWorkflowPlanningEvidence } from './workflow-clarification.js';

export interface SuggestWorkflowReviewFollowUpsInput extends WorkflowReviewSuggestionsInput {
  model: BaseChatModel;
}
export type ProposedWorkflowReviewSuggestionEvidence =
  ProposedWorkflowPlanningEvidence | WorkflowReviewQuestionEvidence;
export type WorkflowReviewSuggestionsModelOutput =
  WorkflowReviewSuggestionsProposal<ProposedWorkflowReviewSuggestionEvidence>;
export interface WorkflowReviewSuggestionPlanningFailure {
  stage: 'proposal-schema' | 'source-validation';
  output: unknown;
}
