import { z } from 'zod';
import type { WorkflowReviewFeedback } from '../types/workflow-review-feedback.js';
import type { WorkflowReviewBoundary } from '../types/workflow-review-suggestions.js';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';
import { workflowReviewBoundarySchema } from './workflow-review-suggestion-settings-schema.js';

export const workflowReviewFeedbackSchema = z.strictObject({
  kind: z.literal('review-feedback'),
  boundaryKey: planningEvidenceTextSchema,
  expectedRevision: z.number().int().nonnegative(),
  scope: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('review') }),
    z.strictObject({
      kind: z.literal('question'),
      questionId: planningEvidenceTextSchema,
    }),
  ]),
  text: planningEvidenceTextSchema,
}) satisfies z.ZodType<WorkflowReviewFeedback>;

/** Derive exact review/question identities from the caller's current source-owned boundary. */
export function createWorkflowReviewFeedbackSchema(
  input: WorkflowReviewBoundary,
) {
  const boundary = workflowReviewBoundarySchema.parse(input);
  const reviewScope = z.strictObject({ kind: z.literal('review') });
  const scope =
    boundary.questions.length === 0
      ? reviewScope
      : z.discriminatedUnion('kind', [
          reviewScope,
          z.strictObject({
            kind: z.literal('question'),
            questionId: z.enum(
              boundary.questions.map((question) => question.id),
            ),
          }),
        ]);
  return workflowReviewFeedbackSchema.extend({
    boundaryKey: z.literal(boundary.key),
    expectedRevision: z.literal(boundary.revision),
    scope,
  });
}
