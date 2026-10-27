import { z } from 'zod';
import {
  createNativeOutputPointerSelectionSchema,
  isSchemaProvablyEmpty,
} from '@openapi-flow/core';
import type { NativeOutputContract } from '@openapi-flow/core';

export const nativeValueCollectionParametersSchema = z.strictObject({
  sourceNodeId: z
    .string()
    .min(1)
    .describe('Exact actual native JSON producer ID.'),
  pointer: z
    .string()
    .describe(
      'RFC 6901 pointer into each native output. Empty string collects each unchanged whole JSON object. Arrays remain nested arrays; no flattening or type conversion.',
    ),
});

export function createNativeValueCollectionParametersSchema(
  sources: NativeOutputContract[],
) {
  const variants = sources.flatMap((source) => {
    const pointer = createNativeOutputPointerSelectionSchema(source);
    if (isSchemaProvablyEmpty(z.toJSONSchema(pointer))) return [];
    return [
      nativeValueCollectionParametersSchema.extend({
        sourceNodeId: z.literal(source.nodeId),
        pointer,
      }),
    ];
  });
  return variants.length ? z.union(variants) : z.never();
}
