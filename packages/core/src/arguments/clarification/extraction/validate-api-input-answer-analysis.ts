import { isDeepStrictEqual } from 'node:util';
import type { ValidateApiInputAnswerAnalysisInput } from '../../../types/api-input-answer-extraction.js';
import { resolveApiInputAnswerInterpretations } from './resolve-api-input-answer-interpretations.js';
import { validateApiInputAnswerExtractionRecord } from './validate-api-input-answer-extraction-record.js';

/** Replay model choices against independently supplied original questions and reply. */
export function validateApiInputAnswerAnalysis(
  input: ValidateApiInputAnswerAnalysisInput,
): void {
  const context = {
    reply: input.reply,
    requirements: input.requirements,
    ...(input.selectOasEnums === undefined
      ? {}
      : { selectOasEnums: input.selectOasEnums }),
  };
  const { analysis } = input;
  if (!Array.isArray(analysis.sources))
    throw new Error('API input answer analysis.sources must be an array');
  const resolved = resolveApiInputAnswerInterpretations({
    ...context,
    selections: analysis.sources.map((source) => ({
      requirementId: source.requirementId,
      sourceFormat: source.sourceFormat,
      sourceText: source.sourceText,
    })),
    ...(analysis.enumSelections === undefined
      ? {}
      : {
          enumSelections: analysis.enumSelections.map((selection) => ({
            requirementId: selection.requirementId,
            candidateId: selection.candidateId,
            intent: selection.intent,
            reason: selection.reason,
          })),
        }),
  });
  if (analysis.extraction !== undefined) {
    validateApiInputAnswerExtractionRecord({
      ...context,
      record: analysis.extraction,
    });
    if (!isDeepStrictEqual(analysis.extraction.verification, resolved))
      throw new Error(
        'API input explanation differs from its code-resolved answer selection',
      );
  }
  const status = !input.requirements.length
    ? 'no-pending-inputs'
    : input.reply === ''
      ? 'empty-reply'
      : 'extracted';
  if (
    !isDeepStrictEqual(analysis, {
      status,
      ...resolved,
      ...(analysis.extraction === undefined
        ? {}
        : { extraction: analysis.extraction }),
    })
  )
    throw new Error(
      'API input analysis differs from its original reply, contracts or code-resolved values',
    );
}
