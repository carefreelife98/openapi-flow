import { z } from 'zod';
import type {
  ApiBindingKeyProposal,
  ApiBindingKeySourceSelection,
} from '../types/api-binding-keys.js';
import { apiLiteralSourceSelectionSchema } from './api-literal-source-selection-schema.js';

export const apiBindingKeySourceSchema = z.union([
  apiLiteralSourceSelectionSchema.options[0].omit({ targetPointer: true }),
  apiLiteralSourceSelectionSchema.options[1].omit({ targetPointer: true }),
]) satisfies z.ZodType<ApiBindingKeySourceSelection>;

export const apiBindingKeyProposalSchema = z.strictObject({
  nodeId: z.string().min(1),
  kind: z.enum(['key', 'path']),
  value: z.string(),
  source: apiBindingKeySourceSchema,
}) satisfies z.ZodType<ApiBindingKeyProposal>;
