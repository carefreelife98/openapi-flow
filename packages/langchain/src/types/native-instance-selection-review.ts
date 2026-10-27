import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { NativeSelectedPlanningInput } from '@openapi-flow/core';
import type { NativePlanningRejectedProposal } from './native-planning-rejection.js';

export interface ReviewNativeInstanceSelectionInput extends NativeSelectedPlanningInput {
  model?: BaseChatModel;
  signal?: AbortSignal;
  rejectedProposals?: NativePlanningRejectedProposal[];
}

export interface NativeInstanceSelectionReviewFailure {
  output: unknown;
  requestFingerprint?: string;
}
