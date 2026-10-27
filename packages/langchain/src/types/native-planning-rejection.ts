import type { z } from 'zod';
import type {
  NativeInstanceSelectionDescription,
  NativeInstanceSelectionFeedbackDescription,
} from '@openapi-flow/core';
import type { nativePlanningRejectionSchema } from '../schemas/native-planning-rejection-schema.js';
import type { SelectNativeNodeInstancesInput } from './native-node-planning.js';
import type { ReviewNativeInstanceSelectionInput } from './native-instance-selection-review.js';

export type NativePlanningRejectedProposal = z.infer<
  typeof nativePlanningRejectionSchema
>;

export interface NativeSelectionRequestDescription extends Pick<
  NativeInstanceSelectionDescription,
  'context'
> {
  requestFingerprint: string;
  feedback?: NativeInstanceSelectionFeedbackDescription;
}

export interface NativePlanningRejectionValidationInput {
  stage: NativePlanningRejectedProposal['stage'];
  requestFingerprint: string;
  rejectedProposals?: NativePlanningRejectedProposal[];
}

export interface CreateNativeSelectionRejectionInput extends SelectNativeNodeInstancesInput {
  error: unknown;
}

export interface CreateNativeSelectionReviewRejectionInput extends ReviewNativeInstanceSelectionInput {
  error: unknown;
}
