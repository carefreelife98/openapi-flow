import { isDeepStrictEqual } from 'node:util';
import type {
  CreateNativeSelectionRejectionInput,
  CreateNativeSelectionReviewRejectionInput,
  NativePlanningRejectedProposal,
} from '../../types/native-planning-rejection.js';
import { nativePlanningRejectionSchema } from '../../schemas/native-planning-rejection-schema.js';
import { NativeNodePlanningError } from '../native-node-planning-error.js';
import { NativeInstanceSelectionReviewError } from './native-instance-selection-review-error.js';
import {
  describeNativeSelectionRequest,
  fingerprintNativeSelectionReviewRequest,
} from './describe-native-planning-request.js';

/** Only unchanged, source-bound output failures are eligible; transport/configuration failures are not proposals. */
export function createNativeSelectionRejection(
  input: CreateNativeSelectionRejectionInput,
): NativePlanningRejectedProposal | undefined {
  const error = input.error;
  if (
    !(error instanceof NativeNodePlanningError) ||
    error.failure.stage !== 'instance-selection' ||
    error.failure.requestFingerprint === undefined
  )
    return undefined;
  const current = describeNativeSelectionRequest(input);
  if (current.requestFingerprint !== error.failure.requestFingerprint)
    return undefined;
  const parsed = nativePlanningRejectionSchema.safeParse({
    stage: 'instance-selection',
    requestFingerprint: current.requestFingerprint,
    output: error.failure.output,
    reason: error.message,
  });
  if (
    !parsed.success ||
    !isDeepStrictEqual(parsed.data.output, error.failure.output)
  )
    return undefined;
  return structuredClone(parsed.data);
}

export function createNativeSelectionReviewRejection(
  input: CreateNativeSelectionReviewRejectionInput,
): NativePlanningRejectedProposal | undefined {
  const error = input.error;
  if (
    !(error instanceof NativeInstanceSelectionReviewError) ||
    error.failure.requestFingerprint === undefined
  )
    return undefined;
  const requestFingerprint = fingerprintNativeSelectionReviewRequest(input);
  if (requestFingerprint !== error.failure.requestFingerprint) return undefined;
  const parsed = nativePlanningRejectionSchema.safeParse({
    stage: 'selection-review',
    requestFingerprint,
    output: error.failure.output,
    reason: error.message,
  });
  if (
    !parsed.success ||
    !isDeepStrictEqual(parsed.data.output, error.failure.output)
  )
    return undefined;
  return structuredClone(parsed.data);
}
