import type {
  ApiInputAnswerExtractionRecord,
  CreateApiInputAnswerExtractionRecordInput,
} from '../../../types/api-input-answer-extraction.js';
import { apiInputAnswerExtractionDecisionSchema } from '../../../schemas/api-input-answer-extraction-schema.js';
import { captureApiInputAnswerContext } from './capture-api-input-answer-context.js';
import { resolveApiInputAnswerInterpretations } from './resolve-api-input-answer-interpretations.js';

export function createApiInputAnswerExtractionRecord(
  input: CreateApiInputAnswerExtractionRecordInput,
): ApiInputAnswerExtractionRecord {
  const evidence = captureApiInputAnswerContext({
    reply: input.reply,
    ...(input.sourceMessages === undefined
      ? {}
      : { sourceMessages: input.sourceMessages }),
    requirements: input.requirements,
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
    ...(input.selectOasEnums === undefined
      ? {}
      : { selectOasEnums: input.selectOasEnums }),
  });
  const decision = structuredClone(
    apiInputAnswerExtractionDecisionSchema.parse(input.decision),
  );
  const verification = resolveApiInputAnswerInterpretations({
    ...evidence,
    selections: decision.answers.map((source) => ({
      requirementId: source.requirementId,
      sourceFormat: source.sourceFormat,
      sourceText: source.sourceText,
      ...(source.messageId === undefined
        ? {}
        : { messageId: source.messageId }),
    })),
    ...(decision.enumSelections === undefined
      ? {}
      : { enumSelections: decision.enumSelections }),
  });
  return {
    kind: 'model-extracted-api-input-answers',
    decision,
    evidence,
    verification,
  };
}
