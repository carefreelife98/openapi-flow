import { z } from 'zod';

export const literalDataParametersSchema = z.strictObject({
  fields: z
    .array(
      z.strictObject({
        name: z
          .string()
          .min(1)
          .describe(
            'Output field name requested or needed for the branch result.',
          ),
        value: z
          .union([z.string(), z.number(), z.boolean(), z.null()])
          .describe(
            'Explicit typed literal, such as the explanation for skipping this branch. No expressions, credentials, fabricated API responses or inferred input values.',
          ),
      }),
    )
    .min(1)
    .superRefine((fields, context) => {
      const names = new Set<string>();
      fields.forEach((field, index) => {
        if (names.has(field.name))
          context.addIssue({
            code: 'custom',
            path: [index, 'name'],
            message: 'Literal output field names must be unique',
          });
        names.add(field.name);
      });
    }),
});
