import { z } from 'zod';
import { describeApiLiteralJsonSources } from '@openapi-flow/core';
import type { WorkflowSourceMessage } from '@openapi-flow/core';
import type { ApiLiteralGenerationSource } from '../types/argument-generation.js';

/** No model-rewritten sourceText. JSON choices are bounded to the selected original message. */
export function createApiLiteralSourceSelectionsSchema(
  messages: WorkflowSourceMessage[],
): z.ZodType<ApiLiteralGenerationSource[]> {
  const catalog = describeApiLiteralJsonSources(messages);
  const identity = {
    targetPointer: z
      .string()
      .describe(
        'RFC 6901 pointer relative to values. Cover every proposed leaf or an explicitly supplied whole object/array. Never target a confirmed or bound value.',
      ),
  };
  const textBase = z.strictObject({
    ...identity,
    sourceFormat: z
      .literal('text')
      .describe(
        'An unquoted verbatim string. Code uses the exact proposed string as sourceText and checks the original message; do not generate a quotation again. Not for quoted JSON strings, numbers, booleans, null, objects or arrays.',
      ),
  });
  const text: z.ZodType<ApiLiteralGenerationSource> =
    messages.length > 1
      ? textBase.extend({ messageId: z.enum(messages.map((item) => item.id)) })
      : textBase;
  const json: z.ZodType<ApiLiteralGenerationSource>[] = catalog
    .filter((entry) => entry.json.length > 0)
    .map((entry) => {
      const candidate = z.strictObject({
        ...identity,
        sourceFormat: z.literal('json'),
        candidateId: z
          .enum(entry.json.map((item) => item.id))
          .describe(
            'Select the exact original JSON token from literalJsonSources in this message. Code copies it, parses it and verifies equality with the proposed value. Never generate sourceText.',
          ),
      });
      return messages.length > 1
        ? candidate.extend({ messageId: z.literal(entry.messageId) })
        : candidate;
    });
  const source = json.length ? z.union([text, ...json]) : text;
  return z.array(source).min(1);
}
