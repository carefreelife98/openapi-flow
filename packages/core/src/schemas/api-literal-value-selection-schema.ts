import { z } from 'zod';
import type { ApiLiteralValueSelection } from '../types/api-input-literal-source.js';
const identity = { targetPointer: z.string(), messageId: z.string().min(1) };
export const apiLiteralValueSelectionSchema = z.union([
  z.strictObject({
    ...identity,
    sourceFormat: z.literal('json'),
    candidateId: z.string().min(1),
  }),
  z.strictObject({
    ...identity,
    sourceFormat: z.literal('text'),
    sourceText: z.string().min(1),
  }),
]) satisfies z.ZodType<ApiLiteralValueSelection>;
export const apiLiteralValueSelectionsSchema = z
  .array(apiLiteralValueSelectionSchema)
  .min(1);
