import { z } from 'zod';

/** Private, lossless model-output feedback; not a public progress/error payload. */
export const nativePlanningRejectionSchema = z.strictObject({
  stage: z.enum(['instance-selection', 'selection-review']),
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  output: z.json(),
  reason: z.string().min(1),
});
