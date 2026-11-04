import { z } from 'zod';
import { createNativeOutputPointerSelectionSchema } from '@openapi-flow/core';
import type { NativeOutputContract } from '@openapi-flow/core';
import {
  outputFieldSelectionSchema,
  outputFieldSelectionParametersSchema,
} from './output-field-selection-schema.js';

const fieldSchema = outputFieldSelectionSchema.extend({
  sourceNodeId: z
    .string()
    .min(1)
    .describe('An actual configured native JSON producer.'),
});
export const nativeOutputObjectParametersSchema =
  outputFieldSelectionParametersSchema.safeExtend({
    fields: z.array(fieldSchema).min(1),
  });
export function createNativeOutputObjectParametersSchema(
  sources: NativeOutputContract[],
) {
  const fields = sources.map((source) =>
    fieldSchema.extend({
      sourceNodeId: z.literal(source.nodeId),
      pointer: createNativeOutputPointerSelectionSchema(source),
    }),
  );
  return nativeOutputObjectParametersSchema.safeExtend({
    fields: z.array(fields.length ? z.union(fields) : z.never()).min(1),
  });
}
