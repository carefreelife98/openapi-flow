import type {
  WorkflowReviewBoundary,
  WorkflowReviewQuestion,
} from './workflow-review-suggestions.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';

export type WorkflowReviewFeedbackScope =
  | { kind: 'review' }
  | { kind: 'question'; questionId: WorkflowReviewQuestion['id'] };

/** Human-authored feedback is never a choice, a literal API value, or an approval. */
export interface WorkflowReviewFeedback {
  kind: 'review-feedback';
  boundaryKey: WorkflowReviewBoundary['key'];
  expectedRevision: WorkflowReviewBoundary['revision'];
  scope: WorkflowReviewFeedbackScope;
  text: string;
}

export interface CreateWorkflowReviewFeedbackInput {
  boundary: WorkflowReviewBoundary;
  feedback: WorkflowReviewFeedback;
  messageId: WorkflowSourceMessage['id'];
}

/** The host decides which planning stage to revisit. This receipt applies no graph edit. */
export interface WorkflowReviewFeedbackReceipt {
  boundaryKey: WorkflowReviewBoundary['key'];
  boundaryKind: WorkflowReviewBoundary['kind'];
  expectedRevision: WorkflowReviewBoundary['revision'];
  scope: WorkflowReviewFeedbackScope;
  question?: WorkflowReviewQuestion;
  message: WorkflowSourceMessage;
}
