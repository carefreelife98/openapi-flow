import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { NativeSelectedPlanningInput } from '@openapi-flow/core';

export interface ReviewNativeInstanceSelectionInput extends NativeSelectedPlanningInput {
  model?: BaseChatModel;
  signal?: AbortSignal;
}

export interface NativeInstanceSelectionReviewFailure {
  output: unknown;
}
