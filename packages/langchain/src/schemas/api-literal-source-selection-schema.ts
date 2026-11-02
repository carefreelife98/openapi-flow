import { describeApiLiteralSourceChoices } from '../arguments/describe-api-literal-source-choices.js';
import { z } from 'zod';
import { createApiRequestInputPointerSchema } from '@openapi-flow/core';
import type {
  WorkflowSourceMessage,
  ApiArgumentGenerationContract,
  JsonObject,
} from '@openapi-flow/core';
import type { ApiLiteralGenerationSource } from '../types/argument-generation.js';

/** Root choices are OAS-type filtered; dynamic descendants retain full runtime OAS validation. */
export function createApiLiteralSourceSelectionsSchema(
  messages: WorkflowSourceMessage[],
  contract: ApiArgumentGenerationContract,
): z.ZodType<ApiLiteralGenerationSource[]> {
  const requestSchema = z.toJSONSchema(contract.valuesSchema) as JsonObject;
  const textBase = z.strictObject({
    targetPointer: createApiRequestInputPointerSchema(requestSchema),
    sourceFormat: z.literal('text'),
    sourceText: z
      .string()
      .min(1)
      .describe(
        'Select one exact nonempty unquoted source span from the original message. Code verifies its complete occurrence and uses this text as the string value. Never also generate values, rewrite text, decode quoted JSON or choose a number for a numeric input.',
      ),
  });
  const text: z.ZodType<ApiLiteralGenerationSource> =
    messages.length > 1
      ? textBase.extend({
          messageId: z.enum(messages.map((entry) => entry.id)),
        })
      : textBase;
  const choices: z.ZodType<ApiLiteralGenerationSource>[] = [text];
  for (const group of describeApiLiteralSourceChoices(messages, contract)) {
    if (!group.candidates.length) continue;
    const targetPointer = group.descendants
      ? z
          .string()
          .regex(
            new RegExp(
              `^${group.inputRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[\\s\\S]+$`,
            ),
          )
      : z.literal(group.inputRoot);
    const base = z.strictObject({
      targetPointer,
      sourceFormat: z.literal('json'),
      candidateId: z.enum(group.candidates.map((candidate) => candidate.id)),
    });
    choices.push(
      messages.length > 1
        ? base.extend({ messageId: z.literal(group.messageId) })
        : base,
    );
  }
  return z.array(z.union(choices)).min(1);
}
