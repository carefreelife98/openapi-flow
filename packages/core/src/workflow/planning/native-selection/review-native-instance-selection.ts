import type {
  NativeSelectedPlanningInput,
  NativeInstanceSelectionInput,
} from '../../../types/native-node-planning.js';
import type {
  CreateNativeInstanceSelectionReviewInput,
  ValidateNativeInstanceSelectionReviewInput,
  NativeInstanceSelectionReview,
  NativeInstanceSelectionReviewDescription,
  NativeInstanceSelectionFeedback,
  NativeInstanceSelectionFeedbackDescription,
} from '../../../types/native-instance-selection-review.js';
import { createNativeInstanceSelectionReviewSchema } from '../../../schemas/native-instance-selection-review-schema.js';
import { validateNativeInstanceSelection } from '../resolve-native-instance-selection.js';
import { jsonValuesEqual } from '../../../utils/json-values-equal.js';

export function describeNativeInstanceSelectionReview(
  input: NativeSelectedPlanningInput,
): NativeInstanceSelectionReviewDescription {
  const selection = validateNativeInstanceSelection(input);
  return structuredClone({
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
  const assessments = Object.values(proposal.assessments);
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
  return {
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
            : 'needs-reselection',
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
  const source = { ...input, selection: feedback.selection };
  const description = describeNativeInstanceSelectionReview(source);
  const review = validateNativeInstanceSelectionReview({
    ...source,
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
    ...(previousSelections === undefined ? {} : { previousSelections }),
  });
}
