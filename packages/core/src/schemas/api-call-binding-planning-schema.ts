import { z } from 'zod';
import { optionalPlanningExplanationSchema } from './optional-planning-explanation-schema.js';

export const apiCallBindingOptionsSchema = z.object({
  callId: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0),
  includeExplanations: z.boolean().optional(),
});

export const apiCallBindingGapSchema = z.strictObject({
  targetPointer: z.string().min(1),
  description: z.string().min(1),
});

export const apiBindingSourceProposalSchema = z.strictObject({
  sourceNodeIds: z.array(z.string().min(1)),
  gaps: z.array(apiCallBindingGapSchema),
  reason: optionalPlanningExplanationSchema,
});

export const apiCallBindingProposalSchema = z.strictObject({
  bindings: z.array(
    z.strictObject({
      targetPointer: z.string().min(1),
      sourceNodeId: z.string().min(1),
      sourcePointer: z.string(),
    }),
  ),
  gaps: z.array(apiCallBindingGapSchema),
  reason: optionalPlanningExplanationSchema,
});

export const apiBindingSourceSelectionSchema =
  apiBindingSourceProposalSchema.extend({
    fingerprint: z.string().min(1),
    callId: z.string().min(1),
  });

export const apiCallBindingPlanSchema = z.strictObject({
  fingerprint: z.string().min(1),
  callId: z.string().min(1),
  sources: apiBindingSourceSelectionSchema,
  bindings: z.array(
    z.strictObject({
      kind: z.literal('node-output'),
      targetPointer: z.string().min(1),
      sourceNodeId: z.string().min(1),
      sourcePointer: z.string(),
    }),
  ),
  gaps: z.array(apiCallBindingGapSchema.extend({ callId: z.string().min(1) })),
  reason: z.string().min(1).optional(),
});
