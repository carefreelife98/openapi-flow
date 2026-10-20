import { z } from 'zod';
import type { WorkflowNativeReferenceBinding } from '../types/native-parameter-reference.js';

export const nativeReferenceBindingSchema = z.strictObject({
  nodeIdPointer: z.string().min(1),
  valuePointer: z.string().min(1).optional(),
  reference: z.discriminatedUnion('source', [
    z.strictObject({
      source: z.literal('response'),
      nodeId: z.string().min(1),
      pointer: z.string(),
    }),
    z.strictObject({
      source: z.literal('node-output'),
      nodeId: z.string().min(1),
      pointer: z.string(),
    }),
    z.strictObject({
      source: z.literal('exclusive-output'),
      nodeId: z.string().min(1),
    }),
  ]),
}) satisfies z.ZodType<WorkflowNativeReferenceBinding>;
