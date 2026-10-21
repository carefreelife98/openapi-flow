import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  createWorkflowReviewFeedback,
  createWorkflowReviewFeedbackSchema,
  isWorkflowReviewFeedback,
} from '@openapi-flow/core';
import type {
  WorkflowReviewBoundary,
  WorkflowReviewFeedback,
  WorkflowReviewFeedbackReceipt,
} from '@openapi-flow/core';

const boundary: WorkflowReviewBoundary = {
  key: 'consumer-review',
  revision: 1,
  kind: 'candidate-review',
  questions: [],
  data: {},
};
const feedback: WorkflowReviewFeedback = {
  kind: 'review-feedback',
  boundaryKey: boundary.key,
  expectedRevision: 1,
  scope: { kind: 'review' },
  text: '  Keep "0007" and revise the API selection.  ',
};
const receipt: WorkflowReviewFeedbackReceipt = createWorkflowReviewFeedback({
  boundary,
  feedback,
  messageId: 'consumer-human',
});
assert.equal(receipt.message.text, feedback.text);
assert.equal(isWorkflowReviewFeedback(feedback), true);
assert.equal(Object.hasOwn(receipt, 'approve'), false);
assert.equal(
  createWorkflowReviewFeedbackSchema(boundary).safeParse({
    ...feedback,
    approve: true,
  }).success,
  false,
);
assert.equal(
  z.toJSONSchema(createWorkflowReviewFeedbackSchema(boundary)).type,
  'object',
);
