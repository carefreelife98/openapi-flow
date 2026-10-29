import { z } from 'zod';
import type { NativeOutputProvenance } from '../types/node-output.js';
import { nativeReferenceBindingSchema } from './native-reference-binding-schema.js';

export const nativeOutputProvenanceSchema = z.strictObject({
  capability: z.string().refine((value) => value.trim().length > 0),
  description: z.string(),
  references: z.array(nativeReferenceBindingSchema.shape.reference),
}) satisfies z.ZodType<NativeOutputProvenance>;
