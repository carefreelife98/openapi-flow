import { z } from 'zod';
import { apiOperationKeySchema } from './api-operation-key-schema.js';

export const apiOperationAnswersSchema = z
  .array(
    z.union([
      z.strictObject({
        questionId: z.string().min(1),
        operation: apiOperationKeySchema,
      }),
      z.strictObject({
        questionId: z.string().min(1),
        operations: z.array(apiOperationKeySchema),
      }),
    ]),
  )
  .min(1);
