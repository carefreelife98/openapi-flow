import { z } from 'zod';

export const responseArrayParametersSchema = z.strictObject({
  sourceNodeId: z
    .string()
    .min(1)
    .describe(
      'Existing API callId whose declared OAS response contains the scenario-required array.',
    ),
  pointer: z
    .string()
    .describe(
      'RFC 6901 pointer into that response body selecting the array. Empty string selects an array body. Never select a first element instead of iterating.',
    ),
});

export function createResponseArrayParametersSchema(callIds: string[]) {
  if (!callIds.length) throw new Error('array parameters require API callIds');
  return responseArrayParametersSchema.extend({
    sourceNodeId: z
      .enum(callIds)
      .describe(
        'Only a supplied API callId; code derives and validates the response array contract.',
      ),
  });
}
