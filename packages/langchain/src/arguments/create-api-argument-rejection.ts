import { isDeepStrictEqual } from 'node:util';
import { describeApiLiteralGeneration } from '@openapi-flow/core';
import type {
  CreateApiArgumentRejectionInput,
  ApiArgumentRejection,
} from '../types/argument-generation.js';
import { apiLiteralGenerationOptionsSchema } from '../schemas/api-literal-generation-output-schema.js';
import { apiArgumentRejectionSchema } from '../schemas/api-argument-rejection-schema.js';
import { fingerprintApiArgumentSource } from './fingerprint-api-argument-source.js';
import { ApiArgumentPlanningError } from './api-argument-planning-error.js';

/** Return feedback only for the original unchanged literal source and lossless JSON output. */
export function createApiArgumentRejection(
  input: CreateApiArgumentRejectionInput,
): ApiArgumentRejection | undefined {
  const error = input.error;
  if (!(error instanceof ApiArgumentPlanningError)) return undefined;
  const options = apiLiteralGenerationOptionsSchema.parse({
    includeExplanations: input.includeExplanations,
    selectOasEnums: input.selectOasEnums,
    trackRequestedInputs: input.trackRequestedInputs,
  });
  const current = describeApiLiteralGeneration(input);
  if (
    error.sourceFingerprint !==
    fingerprintApiArgumentSource(current.input, options)
  )
    return undefined;
  const result = apiArgumentRejectionSchema.safeParse({
    sourceFingerprint: error.sourceFingerprint,
    code: error.diagnostic.code,
    stage: error.diagnostic.stage,
    reason: error.message,
    ...(error.output === undefined ? {} : { output: error.output }),
  });
  if (!result.success || !isDeepStrictEqual(result.data.output, error.output))
    return undefined;
  return structuredClone(result.data);
}
