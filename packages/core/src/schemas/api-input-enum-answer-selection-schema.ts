import { z } from 'zod';
import { apiInputMessageLiteralSourceSchema } from './api-input-literal-source-schema.js';
import { optionalPlanningExplanationSchema } from './optional-planning-explanation-schema.js';
import type { ApiInputEnumAnswerSelection } from '../types/api-input-enum-answers.js';

export const apiInputEnumAnswerSelectionSchema = z.strictObject({
  requirementId: z.string().min(1),
  candidateId: z.string().min(1),
  intent: apiInputMessageLiteralSourceSchema,
  sourceFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  reason: optionalPlanningExplanationSchema,
}) satisfies z.ZodType<ApiInputEnumAnswerSelection>;

export const apiInputEnumAnswerSelectionsSchema = z.array(
  apiInputEnumAnswerSelectionSchema,
);
