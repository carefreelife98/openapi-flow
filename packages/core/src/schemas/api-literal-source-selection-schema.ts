import { z } from 'zod';
import type { ApiLiteralSourceSelection } from '../types/api-input-literal-source.js';

const literalSourceIdentitySchema = z.strictObject({
  targetPointer: z.string(),
  messageId: z.string().min(1),
});

export const apiLiteralSourceSelectionSchema = z.union([
  literalSourceIdentitySchema.extend({ sourceFormat: z.literal('text') }),
  literalSourceIdentitySchema.extend({
    sourceFormat: z.literal('json'),
    candidateId: z.string().min(1),
  }),
]) satisfies z.ZodType<ApiLiteralSourceSelection>;

export const apiLiteralSourceSelectionsSchema = z.array(
  apiLiteralSourceSelectionSchema,
);
