import { z } from 'zod';

export function createApiRequestMediaTypeSchema(
  mediaTypes: string[],
  includeExplanations = false,
) {
  z.boolean().parse(includeExplanations);
  if (mediaTypes.length < 2)
    throw new Error(
      'request media selection requires multiple declared media types',
    );
  const schema = z.strictObject({
    requestMediaType: z
      .enum(mediaTypes)
      .nullable()
      .describe(
        'Exact OAS requestBody.content key matching an explicitly requested format, or null when the scenario leaves the format unspecified or ambiguous so code can apply the documented default. This is the request Content-Type, not the response format.',
      ),
  });
  return includeExplanations
    ? schema.extend({
        explanation: z.strictObject({
          reason: z
            .string()
            .min(1)
            .refine((value) => value.trim().length > 0)
            .describe(
              'Short user-facing reason in the scenario language for the explicit format match, or for returning null because the format is unspecified/ambiguous. Explain the assessment only; code chooses any documented default and attaches the exact scenario and OAS requestBody. Do not generate quotations, source identities, expected responses or private chain-of-thought.',
            ),
        }),
      })
    : schema;
}
