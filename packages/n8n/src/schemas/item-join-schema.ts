import { z } from 'zod';

export const itemJoinParametersSchema = z.strictObject({
  scopeNodeId: z
    .string()
    .min(1)
    .describe('The supplied native item scope shared by every API branch.'),
  sourceCallIds: z
    .array(z.string().min(1))
    .min(2)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'sourceCallIds must be unique',
    )
    .describe(
      'API call IDs in input-port order. Each participating scope item requires exactly one response from every call. Never business IDs or array-position matching.',
    ),
});

export function createItemJoinParametersSchema(
  scopeIds: string[],
  callIds: string[],
) {
  if (!scopeIds.length || callIds.length < 2)
    throw new Error(
      'item join requires supplied scopes and at least two API calls',
    );
  return itemJoinParametersSchema.extend({
    scopeNodeId: z
      .enum(scopeIds)
      .describe(
        'Only a supplied native scope, resolved through n8n item ancestry.',
      ),
    sourceCallIds: z
      .array(z.enum(callIds))
      .min(2)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        'sourceCallIds must be unique',
      )
      .describe(
        'Existing API call IDs. input1 receives the first call, input2 the second, and so on. Code derives OAS contracts and linking metadata.',
      ),
  });
}
