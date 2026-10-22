import { z } from 'zod';

const apiResponseObjectFieldSchema = z.strictObject({
  name: z
    .string()
    .describe(
      'Literal output property name; dots are not nesting instructions.',
    ),
  sourceNodeId: z
    .string()
    .min(1)
    .describe(
      'An existing selected API callId, never an operation name or invented producer.',
    ),
  pointer: z
    .string()
    .regex(/^(?:\/(?:[^~]|~[01])*)*$/u)
    .describe(
      'RFC 6901 pointer into the unchanged API response body; empty string selects the whole body.',
    ),
});

export const apiResponseObjectParametersSchema = z
  .strictObject({
    fields: z
      .array(apiResponseObjectFieldSchema)
      .min(1)
      .describe(
        'Explicit named output fields. Each value is copied unchanged from the declared OAS response. No formatting, casting, merging, calculations or inferred matching.',
      ),
  })
  .superRefine((value, context) => {
    const names = new Set<string>();
    value.fields.forEach((field, index) => {
      if (names.has(field.name))
        context.addIssue({
          code: 'custom',
          path: ['fields', index, 'name'],
          message: 'Output property names must be unique',
        });
      names.add(field.name);
    });
  });

export function createApiResponseObjectParametersSchema(callIds: string[]) {
  if (!callIds.length)
    throw new Error('response object parameters require API callIds');
  return apiResponseObjectParametersSchema.safeExtend({
    fields: z
      .array(
        apiResponseObjectFieldSchema.extend({
          sourceNodeId: z
            .enum(callIds)
            .describe(
              'Only a supplied API callId. Code derives the output schema from this source contract.',
            ),
        }),
      )
      .min(1),
  });
}
