import type { WorkflowReviewFeedback } from '../../types/workflow-review-feedback.js';
import { workflowReviewFeedbackSchema } from '../../schemas/workflow-review-feedback-schema.js';

/** Structural dispatch only. Acceptance still requires the exact current boundary schema. */
export function isWorkflowReviewFeedback(
  value: unknown,
): value is WorkflowReviewFeedback {
  return workflowReviewFeedbackSchema.safeParse(value).success;
}
