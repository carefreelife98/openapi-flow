import { z } from 'zod';

export const apiInputLiteralSourceSchema = z.strictObject({
  sourceFormat: z
    .enum(['text', 'json'])
    .describe(
      'Use json for a quoted JSON string and include both original quotes in sourceText; json also parses explicit numbers, booleans, null, objects and arrays. Use text only for an unquoted verbatim string. Never use text for a quoted token unless the quote characters themselves are part of the requested string value. No coercion or quote repair.',
    ),
  sourceText: z
    .string()
    .min(1)
    .describe(
      'Exact complete substring from the selected original user message. For a quoted JSON string preserve its original quotes and escapes and use sourceFormat json. Never add/remove quotes, invent text or use a schema default.',
    ),
});
