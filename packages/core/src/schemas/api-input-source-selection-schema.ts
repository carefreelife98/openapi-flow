import { z } from 'zod';
import type {
  ApiInputSourceCatalog,
  ApiInputJsonSourceSelection,
  ApiInputTextSourceSelection,
  ApiInputMessageSourceCatalog,
} from '../types/api-input-source-selection.js';
import { apiInputMessageReferenceSchema } from './api-input-literal-source-schema.js';

export const apiInputSourceSelectionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('json'),
    candidateId: z.string().min(1),
    ...apiInputMessageReferenceSchema.shape,
  }),
  z.strictObject({
    kind: z.literal('text'),
    startTokenId: z.string().min(1),
    endTokenId: z.string().min(1),
    ...apiInputMessageReferenceSchema.shape,
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
  messageId?: string,
) {
  const jsonIds = new Set(catalog.json.map((candidate) => candidate.id));
  const textIds = new Set(
    catalog.text.flatMap((segment) => segment.tokens.map((token) => token.id)),
  );
  const choices: z.ZodType<
    ApiInputJsonSourceSelection | ApiInputTextSourceSelection
  >[] = [];
  if (
    messageId !== undefined &&
    (typeof messageId !== 'string' || !messageId.trim())
  )
    throw new Error('Message source schema requires a nonblank messageId');
  if (jsonIds.size) {
    const json = z.strictObject({
      kind: z.literal('json'),
      candidateId: z
        .string()
        .regex(/^json:\d+:\d+$/)
        .refine((id) => jsonIds.has(id), {
          message: 'Select an offered original JSON source candidate',
        })
        .describe(
          'Select a complete original JSON literal candidate. Code owns its exact text and JSON parsing, including string delimiters.',
        ),
    });
    choices.push(
      messageId === undefined
        ? json
        : json.extend({ messageId: z.literal(messageId) }),
    );
  }
  if (textIds.size) {
    // Wire schemas describe the stable ID grammar. Original-catalog membership
    // remains mandatory locally and is independently rechecked by the resolver.
    // Enumerating every source position makes schema size grow with input text.
    const boundary = z
      .string()
      .regex(/^text:\d+:\d+$/)
      .refine((id) => textIds.has(id), {
        message: 'Select an offered original text boundary',
      });
    const text = z.strictObject({
      kind: z.literal('text'),
      startTokenId: boundary.describe(
        'First token of the exact unquoted string. Start and end must be in the same offered text segment, in original order.',
      ),
      endTokenId: boundary
        .clone()
        .describe(
          'Last token, inclusive, of the exact unquoted string. Code copies every original character between these boundaries, including whitespace.',
        ),
    });
    choices.push(
      messageId === undefined
        ? text
        : text.extend({ messageId: z.literal(messageId) }),
    );
  }
  if (!choices.length)
    throw new Error(
      'API input source selection requires an available original source',
    );
  return z.union(choices);
}

/** Each message keeps its own original offsets and token membership. No concatenated source. */
export function createApiInputMessageSourceSelectionSchema(
  catalogs: ApiInputMessageSourceCatalog[],
) {
  if (!Array.isArray(catalogs))
    throw new Error('messageSources must be an array');
  if (
    !catalogs.length ||
    catalogs.some(
      (entry) =>
        !entry ||
        typeof entry !== 'object' ||
        typeof entry.messageId !== 'string' ||
        !entry.messageId.trim(),
    ) ||
    new Set(catalogs.map((entry) => entry.messageId)).size !== catalogs.length
  )
    throw new Error(
      'Message source catalogs require nonempty, distinct message IDs',
    );
  for (const entry of catalogs)
    if (
      !entry.sources ||
      !Array.isArray(entry.sources.json) ||
      !Array.isArray(entry.sources.text)
    )
      throw new Error(
        `messageSources[${entry.messageId}].sources.json and sources.text must be arrays`,
      );
  const choices = catalogs
    .filter(({ sources }) => sources.json.length || sources.text.length)
    .map(({ messageId, sources }) =>
      createApiInputSourceSelectionSchema(
        sources,
        catalogs.length === 1 ? undefined : messageId,
      ),
    );
  if (!choices.length)
    throw new Error(
      'Message source catalogs have no available original source',
    );
  return z.union(choices);
}
