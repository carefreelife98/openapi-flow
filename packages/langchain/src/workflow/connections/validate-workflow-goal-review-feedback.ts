import { isDeepStrictEqual } from 'node:util';
import {
  validateWorkflowConnectionGoalReview,
  workflowReviewedGoalCandidateSchema,
} from '@openapi-flow/core';
import type { WorkflowReviewedGoalCandidate } from '@openapi-flow/core';
import type { ValidateWorkflowGoalReviewFeedbackInput } from '../../types/workflow-connection-goal-review.js';

/** Verify exact negative judgments against actual current material; never turn them into user intent. */
export function validateWorkflowGoalReviewFeedback(
  input: ValidateWorkflowGoalReviewFeedbackInput,
): WorkflowReviewedGoalCandidate[] {
  if (input.rejectedGoalReviews === undefined) return [];
  if (!Array.isArray(input.rejectedGoalReviews))
    throw new Error('rejectedGoalReviews must be an array when supplied');
  for (const candidate of input.rejectedGoalReviews) {
    const checked = workflowReviewedGoalCandidateSchema.parse(candidate);
    if (!isDeepStrictEqual(checked, candidate))
      throw new Error('Goal review feedback must preserve its exact candidate');
    validateWorkflowConnectionGoalReview({
      ...input,
      session: candidate.session,
      review: candidate.review,
    });
    if (candidate.review.accepted)
      throw new Error('Accepted goal review is not rejection feedback');
  }
  return structuredClone(input.rejectedGoalReviews);
}
