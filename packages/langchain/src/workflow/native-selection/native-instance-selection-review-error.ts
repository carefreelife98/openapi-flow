import { OpenApiFlowError } from '@openapi-flow/core';
import type { NativeInstanceSelectionReviewFailure } from '../../types/native-instance-selection-review.js';

export class NativeInstanceSelectionReviewError extends OpenApiFlowError {
  readonly failure: NativeInstanceSelectionReviewFailure;
  constructor(failure: NativeInstanceSelectionReviewFailure, cause: Error) {
    super({
      message: `Native selection review failed: ${cause.message}`,
      diagnostic: {
        owner: 'langchain',
        operation: 'reviewNativeInstanceSelection',
        stage: 'model-output',
        code: 'MODEL_OUTPUT_INVALID',
      },
      cause,
    });
    this.name = 'NativeInstanceSelectionReviewError';
    this.failure = failure;
  }
}
