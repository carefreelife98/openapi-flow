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
  return responseCollectionParametersSchema.extend({
    sourceNodeId: (callIds.length ? z.enum(callIds) : z.never()).describe(
      'Only a supplied API callId. Code derives response schemas and validates each source.',
    ),
  });
}
