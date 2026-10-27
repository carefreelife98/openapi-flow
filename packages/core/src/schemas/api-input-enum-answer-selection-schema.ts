import { z } from 'zod';
import { apiInputMessageLiteralSourceSchema } from './api-input-literal-source-schema.js';
import type { ApiInputEnumAnswerSelection } from '../types/api-input-enum-answers.js';

export const apiInputEnumAnswerSelectionSchema = z.strictObject({
  requirementId: z.string().min(1),
  candidateId: z.string().min(1),
  intent: apiInputMessageLiteralSourceSchema,
  reason: z
    .string()
    .refine(
      (value) => value.trim().length > 0,
      'An enum choice requires a reason',
    ),
}) satisfies z.ZodType<ApiInputEnumAnswerSelection>;

export const apiInputEnumAnswerSelectionsSchema = z.array(
  apiInputEnumAnswerSelectionSchema,
);
