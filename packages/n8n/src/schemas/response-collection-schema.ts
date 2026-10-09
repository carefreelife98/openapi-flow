import { z } from 'zod';

export const responseCollectionParametersSchema = z.strictObject({
  sourceNodeId: z
    .string()
    .min(1)
    .describe(
      'An existing API callId whose item-linked responses must be collected.',
    ),
  pointer: z
    .string()
    .describe(
      'RFC 6901 pointer into each API response body. Empty string collects the entire unchanged body.',
    ),
});

export function createResponseCollectionParametersSchema(callIds: string[]) {
  if (!callIds.length)
    throw new Error('collection parameters require API callIds');
  return responseCollectionParametersSchema.extend({
    sourceNodeId: z
      .enum(callIds)
      .describe(
        'Only a supplied API callId. Code derives response schemas and validates each source.',
      ),
  });
}
