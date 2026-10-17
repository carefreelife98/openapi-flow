import { z } from 'zod';
import { apiOperationKeySchema } from './api-operation-key-schema.js';

export const apiOperationAnswersSchema = z
  .array(
    z.strictObject({
      questionId: z.string().min(1),
      operation: apiOperationKeySchema,
    }),
  )
  .min(1);
