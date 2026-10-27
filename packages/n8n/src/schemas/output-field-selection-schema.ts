import { z } from 'zod';

export const outputFieldSelectionSchema = z.strictObject({
  name: z
    .string()
    .describe(
      'Workflow-local output property label, not source data. Preserve a label explicitly requested by the user; otherwise choose a concise unique label for the requested role. Dots are literal characters, not nesting instructions.',
    ),
  pointer: z
    .string()
    .regex(/^(?:\/(?:[^~]|~[01])*)*$/u)
    .describe(
      'RFC 6901 pointer into the declared source JSON value. Empty string selects the whole source.',
    ),
});

export const outputFieldSelectionParametersSchema = z
  .strictObject({
    fields: z
      .array(outputFieldSelectionSchema)
      .min(1)
      .describe(
        'Explicit named fields copied unchanged from source values. No casting, formatting, flattening, calculations or inferred matching.',
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
