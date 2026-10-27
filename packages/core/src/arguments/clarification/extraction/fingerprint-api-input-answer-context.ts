import { createHash } from 'node:crypto';
import type { ApiInputAnswerContext } from '../../../types/api-input-answer-extraction.js';
import { captureApiInputAnswerContext } from './capture-api-input-answer-context.js';

/** Functional source identity is independent of whether a display explanation exists. */
export function fingerprintApiInputAnswerContext(
  input: ApiInputAnswerContext,
): string {
  const context = captureApiInputAnswerContext(input);
  return createHash('sha256')
    .update(
      JSON.stringify([
        context.reply,
        context.sourceMessages,
        context.requirements,
        context.purpose,
        context.selectOasEnums,
      ]),
    )
    .digest('hex');
}
