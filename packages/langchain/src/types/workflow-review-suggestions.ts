import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowReviewSuggestionsInput,
  ProposedWorkflowReviewSuggestion,
  ProposedWorkflowReviewChoiceSuggestion,
  WorkflowReviewQuestionEvidence,
} from '@openapi-flow/core';
import type { ProposedWorkflowPlanningEvidence } from './workflow-clarification.js';

export interface SuggestWorkflowReviewFollowUpsInput extends WorkflowReviewSuggestionsInput {
  model: BaseChatModel;
}
export type ProposedWorkflowReviewSuggestionEvidence =
  ProposedWorkflowPlanningEvidence | WorkflowReviewQuestionEvidence;
export type WorkflowReviewTextSuggestionModelOutput =
  | Exclude<
      ProposedWorkflowReviewSuggestion<ProposedWorkflowReviewSuggestionEvidence>,
      { kind: 'answer-question' }
    >
  | Omit<
      Extract<
        ProposedWorkflowReviewSuggestion<ProposedWorkflowReviewSuggestionEvidence>,
        { kind: 'answer-question' }
      >,
      'choiceReply'
    >;
export type WorkflowReviewSuggestionModelOutput =
  | WorkflowReviewTextSuggestionModelOutput
  | ProposedWorkflowReviewChoiceSuggestion;
export interface WorkflowReviewSuggestionsModelOutput {
  suggestions: WorkflowReviewSuggestionModelOutput[];
}
export interface WorkflowReviewSuggestionPlanningFailure {
  stage: 'proposal-schema' | 'source-validation';
  output: unknown;
}
