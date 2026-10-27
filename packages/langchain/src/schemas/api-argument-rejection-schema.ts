import { z } from 'zod';

const source = {
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  reason: z.string().min(1),
  output: z.json().optional(),
};

/** Private model feedback, not a user value source or a public diagnostic projection. */
export const apiArgumentRejectionSchema = z.discriminatedUnion('stage', [
  z.strictObject({
    ...source,
    stage: z.literal('model-output'),
    code: z.literal('MODEL_OUTPUT_INVALID'),
  }),
  z.strictObject({
    ...source,
    stage: z.literal('contract-validation'),
    code: z.literal('API_ARGUMENT_VALIDATION_FAILED'),
  }),
]);

export const apiArgumentRejectionsSchema = z.array(apiArgumentRejectionSchema);
