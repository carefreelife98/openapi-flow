import { z } from 'zod';
import type {
  ApiInputSourceCatalog,
  ApiInputJsonSourceSelection,
  ApiInputTextSourceSelection,
} from '../types/api-input-source-selection.js';

export const apiInputSourceSelectionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('json'), candidateId: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('text'),
    startTokenId: z.string().min(1),
    endTokenId: z.string().min(1),
  }),
]);

export const apiInputAnswerSelectionsSchema = z.array(
  z.strictObject({
    requirementId: z.string().min(1),
    source: apiInputSourceSelectionSchema,
  }),
);

/** Only code-owned IDs can be selected; strings and values are input-only. */
export function createApiInputSourceSelectionSchema(
  catalog: ApiInputSourceCatalog,
) {
  const jsonIds = catalog.json.map((candidate) => candidate.id);
  const textIds = catalog.text.flatMap((segment) =>
    segment.tokens.map((token) => token.id),
  );
  const choices: z.ZodType<
    ApiInputJsonSourceSelection | ApiInputTextSourceSelection
  >[] = [];
  if (jsonIds.length)
    choices.push(
      z.strictObject({
        kind: z.literal('json'),
        candidateId: z
          .enum(jsonIds)
          .describe(
            'Select a complete original JSON literal candidate. Code owns its exact text and JSON parsing, including string delimiters.',
          ),
      }),
    );
  if (textIds.length) {
    const boundary = z.enum(textIds);
    choices.push(
      z.strictObject({
        kind: z.literal('text'),
        startTokenId: boundary.describe(
          'First token of the exact unquoted string. Start and end must be in the same offered text segment, in original order.',
        ),
        endTokenId: boundary
          .clone()
          .describe(
            'Last token, inclusive, of the exact unquoted string. Code copies every original character between these boundaries, including whitespace.',
          ),
      }),
    );
  }
  if (!choices.length)
    throw new Error(
      'API input source selection requires an available original source',
    );
  return z.union(choices);
}
