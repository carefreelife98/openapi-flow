import { z } from 'zod';
import { apiInputLiteralSourceSchema } from './api-input-literal-source-schema.js';

export const apiInputEnumAnswerSelectionSchema = z.strictObject({
  requirementId: z.string().min(1),
  candidateId: z.string().min(1),
  intent: apiInputLiteralSourceSchema,
  reason: z
    .string()
    .refine(
      (value) => value.trim().length > 0,
      'An enum choice requires a reason',
    ),
});

export const apiInputEnumAnswerSelectionsSchema = z.array(
  apiInputEnumAnswerSelectionSchema,
);
