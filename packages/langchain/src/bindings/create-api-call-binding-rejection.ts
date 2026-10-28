import type {
  ApiCallBindingRejection,
  CreateApiCallBindingRejectionInput,
} from '../types/api-call-binding-rejection.js';
import { apiCallBindingRejectionSchema } from '../schemas/api-call-binding-rejection-schema.js';
import { ApiCallBindingPlanningError } from './api-call-binding-planning-error.js';
import { fingerprintApiCallBindingSource } from './fingerprint-api-call-binding-source.js';

export function createApiCallBindingRejection(
  input: CreateApiCallBindingRejectionInput,
): ApiCallBindingRejection | undefined {
  if (!(input.error instanceof ApiCallBindingPlanningError)) return undefined;
  if (input.error.sourceFingerprint !== fingerprintApiCallBindingSource(input))
    return undefined;
  const result = apiCallBindingRejectionSchema.safeParse({
    sourceFingerprint: input.error.sourceFingerprint,
    reason: input.error.message,
    output: input.error.output,
  });
  return result.success ? structuredClone(result.data) : undefined;
}
