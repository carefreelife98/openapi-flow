import { z } from 'zod';

export const parallelBarrierParametersSchema = z.strictObject({
  numberInputs: z.int().min(2),
});
export const alternativeRejoinParametersSchema = z.strictObject({});
