import type {
  ApiLiteralGenerationInput,
  ApiLiteralProposalSource,
} from '@openapi-flow/core';
import type { ApiLiteralGenerationSource } from '../types/argument-generation.js';

/** Single-source identity is code-owned; multi-source identity must be explicitly selected. */
export function attributeApiLiteralGenerationSources(
  input: ApiLiteralGenerationInput,
  sources: ApiLiteralGenerationSource[],
): ApiLiteralProposalSource[] {
  const messages = input.literalSourceMessages;
  if (messages === undefined)
    return sources.map((source) => ({ ...source, messageId: 'scenario' }));
  const first = messages[0];
  if (!first) throw new Error('literalSourceMessages must not be empty');
  if (messages.length === 1)
    return sources.map((source) => ({ ...source, messageId: first.id }));
  return sources.map((source) => {
    if (source.messageId === undefined)
      throw new Error(
        'Multiple literalSourceMessages require a source messageId',
      );
    return { ...source, messageId: source.messageId };
  });
}
