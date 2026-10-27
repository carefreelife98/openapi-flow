import { z } from 'zod';
import { optionalPlanningExplanationObjectSchema } from '@openapi-flow/core';
import type {
  ApiInputEnumAnswerChoice,
  WorkflowSourceMessage,
} from '@openapi-flow/core';
import type {
  ApiArgumentEnumDecisionOutput,
  ApiArgumentEnumDecisionShape,
} from '../types/argument-generation.js';
import { apiLiteralGenerationReasonSchema } from './api-literal-generation-output-schema.js';

export const apiArgumentEnumDecisionSchema = z.union([
  z.strictObject({
    status: z.literal('not-supplied'),
    explanation: optionalPlanningExplanationObjectSchema,
  }),
  z.strictObject({
    status: z.literal('selected'),
    candidateId: z.string().min(1),
    sourceMessageId: z.string().min(1).optional(),
    explanation: optionalPlanningExplanationObjectSchema,
  }),
]);

/** Presence and candidate choice are one enum decision, not a verbatim-answer extraction. */
export function createApiArgumentEnumDecisionSchema(
  choices: ApiInputEnumAnswerChoice[],
  messages: WorkflowSourceMessage[],
  includeExplanations: boolean,
  requireExplanations = true,
): z.ZodType<ApiArgumentEnumDecisionOutput> {
  if (!messages.length)
    throw new Error('API enum decisions require original source messages');
  const explanation = includeExplanations
    ? {
        explanation: requireExplanations
          ? apiLiteralGenerationReasonSchema
          : optionalPlanningExplanationObjectSchema,
      }
    : {};
  const shape: ApiArgumentEnumDecisionShape = {};
  for (const choice of choices) {
    if (!choice.candidates.length)
      throw new Error(`API enum ${choice.requirementId} has no OAS choices`);
    if (Object.hasOwn(shape, choice.requirementId))
      throw new Error(`Duplicate API enum requirement ${choice.requirementId}`);
    Object.defineProperty(shape, choice.requirementId, {
      enumerable: true,
      value: z.union([
        z.strictObject({
          status: z
            .literal('not-supplied')
            .describe(
              'The user has not selected a value meaning for this input. Requiredness, examples, alternatives and future inputs do not supply one. Keep it unresolved.',
            ),
          ...explanation,
        }),
        z.strictObject({
          status: z
            .literal('selected')
            .describe(
              'The original user message actually directs using this value meaning, not merely mentioning the field or illustrating a possible value.',
            ),
          candidateId: z.enum(choice.candidates.map((item) => item.id)),
          ...(messages.length > 1
            ? { sourceMessageId: z.enum(messages.map((item) => item.id)) }
            : {}),
          ...explanation,
        }),
      ]),
    });
  }
  return z.strictObject({ decisions: z.strictObject(shape) });
}
