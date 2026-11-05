import { z } from 'zod';
import {
  createApiRequestInputPointerSchema,
  describeApiLiteralJsonSources,
  optionalPlanningExplanationObjectSchema,
} from '@openapi-flow/core';
import type {
  ApiLiteralTargetContract,
  JsonObject,
  WorkflowSourceMessage,
} from '@openapi-flow/core';
import type { ApiLiteralGenerationOutputSchema } from '../types/argument-generation.js';
import { createApiLiteralSourceChoiceSchemas } from './api-literal-source-selection-schema.js';
import {
  apiLiteralNotProvidedSchema,
  apiLiteralGenerationReasonSchema,
} from './api-literal-generation-output-schema.js';

/** Destinations and original sources are one proposal; no destination-only decision is frozen. */
export function createApiLiteralConstructionPlanSchema(
  requestSchema: JsonObject,
  messages: WorkflowSourceMessage[],
  includeExplanations: boolean,
  requireExplanations: boolean,
  declaredTargets: ApiLiteralTargetContract[],
  constructionRoots: string[],
): ApiLiteralGenerationOutputSchema {
  const pointer: z.ZodType<string> =
    createApiRequestInputPointerSchema(requestSchema);
  const declaredPointers = declaredTargets.map(
    (target) => target.targetPointer,
  );
  const constructionPointer = pointer
    .refine(
      (value) =>
        !declaredPointers.includes(value) &&
        constructionRoots.some((root) => value.startsWith(root + '/')),
    )
    .meta({
      allOf: [
        { not: { enum: declaredPointers } },
        {
          anyOf: constructionRoots.map((root) => ({
            pattern: '^' + root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/',
          })),
        },
      ],
    });
  const choices: z.ZodType[] = createApiLiteralSourceChoiceSchemas(
    messages,
    declaredTargets,
  );
  for (const message of constructionRoots.length
    ? describeApiLiteralJsonSources(messages)
    : []) {
    const identity = {
      targetPointer: constructionPointer,
      ...(messages.length > 1
        ? { messageId: z.literal(message.messageId) }
        : {}),
    };
    choices.push(
      z.strictObject({
        ...identity,
        sourceFormat: z.literal('text'),
        sourceText: z.string().min(1),
      }),
    );
    if (message.json.length)
      choices.push(
        z.strictObject({
          ...identity,
          sourceFormat: z.literal('json'),
          candidateId: z.enum(message.json.map((candidate) => candidate.id)),
        }),
      );
  }
  const base = z.strictObject({
    literalInputs: choices.length
      ? z.union([
          apiLiteralNotProvidedSchema,
          z.strictObject({
            state: z.literal('provided'),
            literalSources: z
              .array(z.union(choices))
              .min(1)
              .describe(
                'A complete construction plan. Each entry copies one original source into its concrete OAS destination. Use contiguous indexed destinations to build arrays and property destinations to build objects. Copy a whole container only from an actual matching complete JSON candidate. Code validates each source against that exact destination and validates the assembled request; no conversion.',
              ),
          }),
        ])
      : apiLiteralNotProvidedSchema,
    requestedInputs: z
      .array(pointer)
      .refine((pointers) => new Set(pointers).size === pointers.length),
  });
  return includeExplanations
    ? (base.extend({
        explanation: requireExplanations
          ? apiLiteralGenerationReasonSchema
          : optionalPlanningExplanationObjectSchema,
      }) as ApiLiteralGenerationOutputSchema)
    : (base as ApiLiteralGenerationOutputSchema);
}
