import { z } from 'zod';
import type { ApiLiteralGenerationSource } from '../types/argument-generation.js';
import type {
  ApiLiteralTargetContract,
  JsonObject,
  WorkflowSourceMessage,
} from '@openapi-flow/core';
import { describeApiLiteralSourceChoices } from '../arguments/describe-api-literal-source-choices.js';

/** An explicit destination scopes both source identity and source value type. */
export function createApiLiteralSourceSelectionsSchema(
  messages: WorkflowSourceMessage[],
  targets: ApiLiteralTargetContract[],
) {
  const choices: z.ZodType[] = [];
  for (const target of targets) {
    const metadata = target.valueSchema.meta() as JsonObject | undefined;
    if (metadata === undefined)
      throw new Error(
        `Literal target ${target.targetPointer} has no OAS metadata`,
      );
    const sourceText = z
      .string()
      .min(1)
      .superRefine((text, context) => {
        const result = target.valueSchema.safeParse(text);
        if (!result.success)
          context.addIssue({
            code: 'custom',
            message: `Text source does not satisfy ${target.targetPointer}`,
          });
      })
      .meta({ allOf: [{ type: 'string', minLength: 1 }, metadata] });
    const text = z.strictObject({
      targetPointer: z.literal(target.targetPointer),
      sourceFormat: z.literal('text'),
      sourceText,
    });
    choices.push(
      messages.length > 1
        ? text.extend({ messageId: z.enum(messages.map((m) => m.id)) })
        : text,
    );
  }
  for (const group of describeApiLiteralSourceChoices(messages, targets)) {
    if (!group.candidates.length) continue;
    const json = z.strictObject({
      targetPointer: z.literal(group.targetPointer),
      sourceFormat: z.literal('json'),
      candidateId: z.enum(group.candidates.map((c) => c.id)),
    });
    choices.push(
      messages.length > 1
        ? json.extend({ messageId: z.literal(group.messageId) })
        : json,
    );
  }
  if (!choices.length) return z.never();
  return z
    .array(z.union(choices))
    .length(targets.length)
    .superRefine((sources, context) => {
      const pointers = sources.map(
        (source) => (source as ApiLiteralGenerationSource).targetPointer,
      );
      if (new Set(pointers).size !== targets.length)
        context.addIssue({
          code: 'custom',
          message: 'Each selected literal target requires exactly one source',
        });
    }) as z.ZodType<ApiLiteralGenerationSource[]>;
}
