import { z } from 'zod';
import {
  createApiInputSourceSelectionSchema,
  createApiInputMessageSourceSelectionSchema,
} from '@openapi-flow/core';
import type {
  ApiInputRequirement,
  ApiInputSourceCatalog,
  ApiInputEnumAnswerChoice,
  ApiInputMessageSourceCatalog,
  ApiInputSourceSelection,
} from '@openapi-flow/core';

export const apiInputAnswerExplanationOptionsSchema = z.strictObject({
  includeExplanations: z.boolean().optional(),
  selectOasEnums: z.boolean().optional(),
});

/** Values and unanswered IDs are deliberately not model-owned output fields. */
export function createApiInputAnswerSourceSchema(
  requirements: ApiInputRequirement[],
  catalog: ApiInputSourceCatalog | undefined,
  includeExplanations = false,
  enumChoices: ApiInputEnumAnswerChoice[] = [],
  messageSources?: ApiInputMessageSourceCatalog[],
) {
  const ids = requirements.map((item) => item.id);
  if (!ids.length || new Set(ids).size !== ids.length)
    throw new Error(
      'Answer source schema requires distinct pending requirements',
    );
  const reason = z
    .string()
    .min(1)
    .describe(
      "A brief user-facing reason in the user's language, grounded only in the original user sources and supplied pending questions. Separate reply context is not a quotation source when explicit messages are supplied. Instruction/schema language does not set the user's language. Never translate input values, identifiers or original source spans. Not a hidden reasoning trace or a claim that code validation passed.",
    );
  let sourceSchema: z.ZodType<ApiInputSourceSelection>;
  if (messageSources !== undefined)
    sourceSchema = createApiInputMessageSourceSelectionSchema(messageSources);
  else {
    if (catalog === undefined)
      throw new Error(
        'Answer source schema requires its original source catalog',
      );
    sourceSchema = createApiInputSourceSelectionSchema(catalog);
  }
  const answer = z.strictObject({
    requirementId: z
      .enum(ids)
      .describe(
        'The offered pending question answered by this exact source span.',
      ),
    source: sourceSchema,
    ...(includeExplanations ? { reason } : {}),
  });
  const enumAnswers = enumChoices.map((choice) => {
    if (!ids.includes(choice.requirementId) || !choice.candidates.length)
      throw new Error(
        `Enum answer schema requires real pending candidates for ${choice.requirementId}`,
      );
    return z.strictObject({
      requirementId: z.literal(choice.requirementId),
      source: z.strictObject({
        kind: z.literal('oas-enum'),
        candidateId: z.enum(choice.candidates.map((candidate) => candidate.id)),
        intent: sourceSchema,
      }),
      reason,
    });
  });
  return z.strictObject({
    answers: z
      .array(enumAnswers.length ? z.union([answer, ...enumAnswers]) : answer)
      .describe(
        'Select each answered pending question at most once. Return [] when the original sources give no complete requested value or supported enum intent. Do not return a value field or fabricate missing inputs.',
      ),
    ...(includeExplanations ? { reason } : {}),
  });
}
