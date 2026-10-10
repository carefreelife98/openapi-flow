import { z } from 'zod';

export const nativeArrayParametersSchema = z.strictObject({
  sourceNodeId: z
    .string()
    .min(1)
    .describe(
      'Existing native node ID with a declared JSON output contract containing the scenario-required array.',
    ),
  pointer: z
    .string()
    .describe(
      'RFC 6901 pointer into the native JSON root selecting an array. Do not use an HTTP body prefix, flatten values or select a first element.',
    ),
});

export function createNativeArrayParametersSchema(nodeIds: string[]) {
  if (!nodeIds.length)
    throw new Error('native array parameters require source node IDs');
  return nativeArrayParametersSchema.extend({
    sourceNodeId: z
      .enum(nodeIds)
      .describe(
        'Only a supplied native node ID; code derives and validates its original output contract.',
      ),
  });
}
