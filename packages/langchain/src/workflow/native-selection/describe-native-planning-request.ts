import { createHash } from 'node:crypto';
import {
  describeNativeInstanceSelection,
  describeNativeInstanceSelectionFeedback,
  describeNativeInstanceSelectionReview,
} from '@openapi-flow/core';
import type { SelectNativeNodeInstancesInput } from '../../types/native-node-planning.js';
import type { ReviewNativeInstanceSelectionInput } from '../../types/native-instance-selection-review.js';
import type { NativeSelectionRequestDescription } from '../../types/native-planning-rejection.js';

export function describeNativeSelectionRequest(
  input: SelectNativeNodeInstancesInput,
): NativeSelectionRequestDescription {
  const { context } = describeNativeInstanceSelection(input);
  const feedback =
    input.feedback === undefined
      ? undefined
      : describeNativeInstanceSelectionFeedback(input, input.feedback);
  return {
    context,
    ...(feedback === undefined ? {} : { feedback }),
    requestFingerprint: createHash('sha256')
      .update(
        JSON.stringify([
          input.planId,
          input.allowRuntimeParameters,
          input.includeExplanations,
          context,
          feedback,
        ]),
      )
      .digest('hex'),
  };
}

export function fingerprintNativeSelectionReviewRequest(
  input: ReviewNativeInstanceSelectionInput,
): string {
  return createHash('sha256')
    .update(JSON.stringify(describeNativeInstanceSelectionReview(input)))
    .digest('hex');
}
