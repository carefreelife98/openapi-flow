import type { NativeInstanceSelectionInput } from '../../../types/native-node-planning.js';
import type {
  CreateNativeInstanceSelectionReviewInput,
  ValidateNativeInstanceSelectionReviewInput,
  NativeInstanceSelectionReview,
  NativeInstanceSelectionReviewDescription,
  NativeInstanceSelectionFeedback,
  NativeInstanceSelectionFeedbackDescription,
  NativeInstanceSelectionReviewInput,
  NativeInstanceRoleAssessment,
} from '../../../types/native-instance-selection-review.js';
import {
  createNativeInstanceSelectionReviewSchema,
  nativeInstanceSelectionReviewOptionsSchema,
} from '../../../schemas/native-instance-selection-review-schema.js';
import { validateNativeInstanceSelection } from '../resolve-native-instance-selection.js';
import { jsonValuesEqual } from '../../../utils/json-values-equal.js';

export function describeNativeInstanceSelectionReview(
  input: NativeInstanceSelectionReviewInput,
): NativeInstanceSelectionReviewDescription {
  const options = nativeInstanceSelectionReviewOptionsSchema.parse({
    reviewInstances: input.reviewInstances,
  });
  const selection = validateNativeInstanceSelection(input);
  return structuredClone({
    ...(options.reviewInstances === true
      ? { reviewInstances: true as const }
      : {}),
    selectionId: selection.id,
    context: selection.context,
    instances: selection.instances.map(
      ({ id, capability, purpose, runtimeParameters }) => ({
        id,
        capability,
        purpose,
        ...(runtimeParameters === undefined ? {} : { runtimeParameters }),
      }),
    ),
    gaps: selection.gaps,
  });
}

export function createNativeInstanceSelectionReview(
  input: CreateNativeInstanceSelectionReviewInput,
): NativeInstanceSelectionReview {
  const description = describeNativeInstanceSelectionReview(input);
  const proposal = createNativeInstanceSelectionReviewSchema(description).parse(
    input.proposal,
  );
  if (!jsonValuesEqual(proposal, input.proposal))
    throw new Error(
      'Native selection review must preserve the complete original proposal',
    );
  let roles: NativeInstanceRoleAssessment[] = [];
  if (description.reviewInstances === true) {
    if (proposal.instanceAssessments === undefined)
      throw new Error(
        'Native selection review requires instanceAssessments for reviewInstances',
      );
    roles = Object.values(proposal.instanceAssessments);
    if (proposal.coverageAssessment === undefined)
      throw new Error(
        'Native selection review requires coverageAssessment for reviewInstances',
      );
  }
  const coverage =
    proposal.coverageAssessment === undefined
      ? []
      : [proposal.coverageAssessment];
  const assessments = [
    ...Object.values(proposal.assessments),
    ...roles,
    ...coverage,
  ];
  for (const assessment of assessments) {
    if (!description.context.scenario.includes(assessment.sourceQuote))
      throw new Error(
        'Native selection review.sourceQuote must be an exact quote from the original scenario',
      );
    const references =
      assessment.kind === 'api-planning'
        ? assessment.callIds
        : assessment.kind === 'connection-planning'
          ? assessment.nodeIds
          : [];
    if (new Set(references).size !== references.length)
      throw new Error('Native selection review references must be unique');
  }
  // A not-required judgment requests a fresh selection. It does not erase the
  // old proposal or override independent blockers; required roles are not execution proof.
  return {
    ...(description.reviewInstances === true
      ? { reviewInstances: true as const }
      : {}),
    selectionId: description.selectionId,
    proposal: structuredClone(proposal),
    status:
      assessments.length === 0
        ? 'no-gaps'
        : assessments.some(
              (entry) => entry.kind === 'unsupported-native-behavior',
            )
          ? 'unavailable-native-behavior'
          : assessments.some((entry) => entry.kind === 'business-decision')
            ? 'needs-business-decision'
            : assessments.some(
                  (entry) =>
                    entry.kind !== 'required' && entry.kind !== 'covered',
                )
              ? 'needs-reselection'
              : 'no-gaps',
  };
}

export function validateNativeInstanceSelectionReview(
  input: ValidateNativeInstanceSelectionReviewInput,
): NativeInstanceSelectionReview {
  if (!input.review || typeof input.review !== 'object')
    throw new Error('Native selection feedback.review is required');
  const review = createNativeInstanceSelectionReview({
    ...input,
    proposal: input.review.proposal,
  });
  if (!jsonValuesEqual(review, input.review))
    throw new Error(
      'Native selection review is stale or its derived routing status was changed',
    );
  return review;
}

/** Feedback authorizes one new selection proposal, never mutating or approving the old one. */
export function describeNativeInstanceSelectionFeedback(
  input: NativeInstanceSelectionInput,
  feedback: NativeInstanceSelectionFeedback,
): NativeInstanceSelectionFeedbackDescription {
  if (!feedback || typeof feedback !== 'object')
    throw new Error(
      'Native selection feedback must contain its original selection and review',
    );
  if (!feedback.review || typeof feedback.review !== 'object')
    throw new Error('Native selection feedback.review is required');
  const source = { ...input, selection: feedback.selection };
  const description = describeNativeInstanceSelectionReview(source);
  const review = validateNativeInstanceSelectionReview({
    ...source,
    ...(feedback.review.reviewInstances === true
      ? { reviewInstances: true as const }
      : {}),
    review: feedback.review,
  });
  if (review.status !== 'needs-reselection')
    throw new Error(
      `Native selection feedback cannot automatically bypass ${review.status}`,
    );
  if (
    feedback.previousSelections !== undefined &&
    !Array.isArray(feedback.previousSelections)
  )
    throw new Error(
      'Native selection feedback.previousSelections must be an array',
    );
  const previousSelections = feedback.previousSelections?.map((selection) => {
    validateNativeInstanceSelection({ ...input, selection });
    return { id: selection.id, proposal: selection.proposal };
  });
  return structuredClone({
    selectionId: description.selectionId,
    selectedInstances: description.instances,
    reportedGaps: description.gaps,
    assessments: review.proposal.assessments,
    ...(review.reviewInstances === true
      ? {
          reviewInstances: true as const,
          instanceAssessments: review.proposal.instanceAssessments,
          coverageAssessment: review.proposal.coverageAssessment,
        }
      : {}),
    ...(previousSelections === undefined ? {} : { previousSelections }),
  });
}
