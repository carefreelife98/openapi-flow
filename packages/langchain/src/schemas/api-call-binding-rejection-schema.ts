import { z } from 'zod';

/** Private validator feedback; never a new scenario, runtime value or public event. */
export const apiCallBindingRejectionSchema = z.strictObject({
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  reason: z.string().min(1),
  output: z.json(),
});
