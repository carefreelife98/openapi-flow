import { z } from 'zod';
import {
  apiBindingKeyProposalSchema,
  apiBindingKeySourceSchema,
  describeApiLiteralJsonSources,
} from '@openapi-flow/core';
import type { ApiCallBindingPlanningDescription } from '@openapi-flow/core';
import type { ApiBindingGeneratedKeySelection } from '../types/api-binding-key-generation.js';

/** Reuse original literal source choices; a sole source message ID is code-owned. */
export function createApiBindingKeyGenerationSchema(
  description: ApiCallBindingPlanningDescription,
): z.ZodType<ApiBindingGeneratedKeySelection[]> | undefined {
  const messages = description.input.literalSourceMessages;
  if (messages === undefined) return undefined;
  const catalog = describeApiLiteralJsonSources(messages);
  const text =
    messages.length === 1
      ? apiBindingKeySourceSchema.options[0].omit({ messageId: true })
      : apiBindingKeySourceSchema.options[0].extend({
          messageId: z.enum(messages.map((item) => item.id)),
        });
  const json = catalog
    .filter((item) => item.json.length > 0)
    .map((item) => {
      const source = apiBindingKeySourceSchema.options[1].extend({
        candidateId: z.enum(item.json.map((candidate) => candidate.id)),
      });
      return messages.length === 1
        ? source.omit({ messageId: true })
        : source.extend({ messageId: z.literal(item.messageId) });
    });
  return z
    .array(
      apiBindingKeyProposalSchema.extend({
        nodeId: z.enum([
          description.input.callId,
          ...description.sourceCandidates.map((item) => item.nodeId),
        ]),
        source: json.length ? z.union([text, ...json]) : text,
      }),
    )
    .describe(
      'Only explicitly requested runtime keys or relative JSON pointer paths copied from original user messages. Known OAS property names are fixed fields, not dynamic keys. Return [] when no explicit key/path value is supplied; never invent a key, reuse an unrelated input value or copy an OAS example.',
    );
}
