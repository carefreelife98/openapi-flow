import { isDeepStrictEqual } from 'node:util';
import type { JsonValue } from '@openapi-flow/core';
import type { ApiInputAnswerProposal } from '../types/api-input-answers.js';

/** A model selects the field; code proves that its complete value occurs in the reply. */
export function validateApiAnswerSource(
  reply: string,
  answer: ApiInputAnswerProposal,
): JsonValue {
  if (!reply.includes(answer.sourceText))
    throw new Error(
      `Answer ${answer.requirementId} sourceText is absent from the user reply`,
    );
  if (answer.sourceFormat === 'text') {
    if (typeof answer.value !== 'string' || answer.value !== answer.sourceText)
      throw new Error(
        `Answer ${answer.requirementId} is not the verbatim string in sourceText`,
      );
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(answer.sourceText);
    } catch (cause) {
      throw new Error(
        `Answer ${answer.requirementId} sourceText is not a complete JSON literal`,
        { cause },
      );
    }
    if (!isDeepStrictEqual(parsed, answer.value))
      throw new Error(
        `Answer ${answer.requirementId} does not equal its JSON sourceText`,
      );
  }
  return answer.value;
}
