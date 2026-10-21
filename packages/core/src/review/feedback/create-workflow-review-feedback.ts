import type {
  CreateWorkflowReviewFeedbackInput,
  WorkflowReviewFeedbackReceipt,
} from '../../types/workflow-review-feedback.js';
import { createWorkflowReviewFeedbackSchema } from '../../schemas/workflow-review-feedback-schema.js';
import { planningEvidenceTextSchema } from '../../schemas/planning-evidence-schema.js';

/** Validate explicit human intent and retain its source, without choosing or approving anything. */
export function createWorkflowReviewFeedback(
  input: CreateWorkflowReviewFeedbackInput,
): WorkflowReviewFeedbackReceipt {
  const feedback = createWorkflowReviewFeedbackSchema(input.boundary).parse(
    input.feedback,
  );
  const messageId = planningEvidenceTextSchema.parse(input.messageId);
  const question =
    feedback.scope.kind === 'question'
      ? input.boundary.questions.find(
          (entry) =>
            feedback.scope.kind === 'question' &&
            entry.id === feedback.scope.questionId,
        )
      : undefined;
  if (feedback.scope.kind === 'question' && question === undefined)
    throw new Error(
      `Review feedback is missing original question ${feedback.scope.questionId}`,
    );
  return {
    boundaryKey: feedback.boundaryKey,
    boundaryKind: input.boundary.kind,
    expectedRevision: feedback.expectedRevision,
    scope: structuredClone(feedback.scope),
    ...(question === undefined ? {} : { question: structuredClone(question) }),
    message: { id: messageId, text: feedback.text },
  };
}
