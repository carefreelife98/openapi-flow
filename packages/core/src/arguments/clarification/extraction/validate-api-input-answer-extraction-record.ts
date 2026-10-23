import { isDeepStrictEqual } from 'node:util';
import type { ValidateApiInputAnswerExtractionRecordInput } from '../../../types/api-input-answer-extraction.js';
import { createApiInputAnswerExtractionRecord } from './create-api-input-answer-extraction-record.js';

/** Replay against separately supplied original context, not a record's self-asserted evidence. */
export function validateApiInputAnswerExtractionRecord(
  input: ValidateApiInputAnswerExtractionRecordInput,
): void {
  const expected = createApiInputAnswerExtractionRecord({
    reply: input.reply,
    requirements: input.requirements,
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
    ...(input.selectOasEnums === undefined
      ? {}
      : { selectOasEnums: input.selectOasEnums }),
    decision: input.record.decision,
  });
  if (!isDeepStrictEqual(expected, input.record))
    throw new Error(
      'API input answer extraction record differs from its original reply, pending contracts or code-resolved values',
    );
}
