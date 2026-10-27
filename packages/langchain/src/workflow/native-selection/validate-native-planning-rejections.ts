import { isDeepStrictEqual } from 'node:util';
import type {
  NativePlanningRejectedProposal,
  NativePlanningRejectionValidationInput,
} from '../../types/native-planning-rejection.js';
import { nativePlanningRejectionSchema } from '../../schemas/native-planning-rejection-schema.js';

export function validateNativePlanningRejections(
  input: NativePlanningRejectionValidationInput,
): NativePlanningRejectedProposal[] {
  if (input.rejectedProposals === undefined) return [];
  const parsed = nativePlanningRejectionSchema
    .array()
    .parse(input.rejectedProposals);
  if (
    !isDeepStrictEqual(parsed, input.rejectedProposals) ||
    parsed.some(
      (entry) =>
        entry.stage !== input.stage ||
        entry.requestFingerprint !== input.requestFingerprint,
    )
  )
    throw new Error(
      'Native rejectedProposals belong to a changed source or different planning stage',
    );
  return structuredClone(parsed);
}
