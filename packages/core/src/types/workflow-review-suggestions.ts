import type { JsonValue } from './api-arguments.js';
import type {
  WorkflowPlanningContext,
  WorkflowPlanningContextDescription,
  WorkflowPlanningEvidence,
} from './planning-evidence.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';

export interface WorkflowReviewQuestion {
  id: string;
  message: string;
}
/** The host owns this read-only review projection, not an executable plan or a new OAS contract. */
export interface WorkflowReviewBoundary {
  key: string;
  kind:
    | 'requirements-clarification'
    | 'selection-review'
    | 'planning-questions'
    | 'candidate-review';
  revision: number;
  questions: WorkflowReviewQuestion[];
  data: JsonValue;
}
export interface WorkflowReviewSuggestionLimits {
  maxSuggestions: number;
}
export type WorkflowReviewSuggestionEnvironment = Record<
  string,
  string | undefined
>;
export interface WorkflowReviewSuggestionOptions {
  includeExplanations?: boolean;
  includeExtensions?: boolean;
}
export interface ResolvedWorkflowReviewSuggestionOptions {
  includeExplanations: boolean;
  includeExtensions: boolean;
}
export interface WorkflowReviewQuestionEvidence {
  kind: 'review-question';
  questionId: string;
}
export type WorkflowReviewSuggestionEvidence =
  WorkflowPlanningEvidence | WorkflowReviewQuestionEvidence;
export type ProposedWorkflowReviewSuggestion<
  Evidence = WorkflowReviewSuggestionEvidence,
> = {
  text: string;
  sources: Evidence[];
  reason?: string;
} & (
  | { kind: 'answer-question'; questionIds: string[] }
  | { kind: 'change-request' | 'extend-workflow' }
);
export interface WorkflowReviewSuggestionsProposal<
  Evidence = WorkflowReviewSuggestionEvidence,
> {
  suggestions: ProposedWorkflowReviewSuggestion<Evidence>[];
}
export type WorkflowReviewSuggestion = ProposedWorkflowReviewSuggestion & {
  id: string;
};
export interface WorkflowReviewSuggestionsInput {
  context: WorkflowPlanningContext;
  boundary: WorkflowReviewBoundary;
  limits: WorkflowReviewSuggestionLimits;
  options?: WorkflowReviewSuggestionOptions;
}
export interface WorkflowReviewSuggestionsDescription {
  fingerprint: string;
  context: WorkflowPlanningContextDescription;
  boundary: WorkflowReviewBoundary;
  limits: WorkflowReviewSuggestionLimits;
  options: ResolvedWorkflowReviewSuggestionOptions;
}
export interface WorkflowReviewSuggestions {
  id: string;
  fingerprint: string;
  boundaryKey: string;
  /** Immutable read-only review target, so historical question sources remain inspectable after a revision. */
  target: Omit<WorkflowReviewBoundary, 'key'>;
  limits: WorkflowReviewSuggestionLimits;
  options: ResolvedWorkflowReviewSuggestionOptions;
  suggestions: WorkflowReviewSuggestion[];
}
export interface CreateWorkflowReviewSuggestionsInput extends WorkflowReviewSuggestionsInput {
  proposal: WorkflowReviewSuggestionsProposal;
}
export interface WorkflowReviewSuggestionsValidationInput extends WorkflowReviewSuggestionsInput {
  review: WorkflowReviewSuggestions;
}
export interface AdoptWorkflowReviewSuggestionInput extends WorkflowReviewSuggestionsValidationInput {
  suggestionId: string;
  messageId: string;
}
/** An explicit adoption receipt. It is not the original human's prose and does not apply an edit. */
export interface WorkflowReviewSuggestionAdoption {
  reviewId: string;
  suggestionId: string;
  boundaryKey: string;
  suggestion: WorkflowReviewSuggestion;
  message: WorkflowSourceMessage;
}
