import type {
  ApiInputAnswerExtractionRecord,
  CreateApiInputAnswerExtractionRecordInput,
} from '../../../types/api-input-answer-extraction.js';
import { apiInputAnswerExtractionDecisionSchema } from '../../../schemas/api-input-answer-extraction-schema.js';
import { captureApiInputAnswerContext } from './capture-api-input-answer-context.js';
import { resolveApiInputAnswerSources } from './resolve-api-input-answer-sources.js';

export function createApiInputAnswerExtractionRecord(
  input: CreateApiInputAnswerExtractionRecordInput,
): ApiInputAnswerExtractionRecord {
  const evidence = captureApiInputAnswerContext({
    reply: input.reply,
    requirements: input.requirements,
  });
  const decision = structuredClone(
    apiInputAnswerExtractionDecisionSchema.parse(input.decision),
  );
  const verification = resolveApiInputAnswerSources({
    ...evidence,
    selections: decision.answers.map((source) => ({
      requirementId: source.requirementId,
      sourceFormat: source.sourceFormat,
      sourceText: source.sourceText,
    })),
  });
  return {
    kind: 'model-extracted-api-input-answers',
    decision,
    evidence,
    verification,
  };
}
