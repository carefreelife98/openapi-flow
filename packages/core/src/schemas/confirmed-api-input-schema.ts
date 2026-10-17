import { z } from 'zod';
import { apiOperationKeySchema } from './api-operation-key-schema.js';

export const confirmedApiInputSchema = z.strictObject({
  callId: z.string().min(1),
  operation: apiOperationKeySchema,
  targetPointer: z.string().min(1),
  value: z.json(),
});

export const confirmedApiInputsSchema = z.array(confirmedApiInputSchema);

export const apiInputAnswersSchema = z
  .array(
    z.strictObject({
      requirementId: z.string().min(1),
      value: z.json(),
    }),
  )
  .min(1);
