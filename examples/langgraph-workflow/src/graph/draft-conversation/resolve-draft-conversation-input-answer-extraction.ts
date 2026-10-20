import { isDeepStrictEqual } from 'node:util';
import {
  resolveApiInputAnswerSources,
  validateApiInputAnswerExtractionRecord,
} from '@openapi-flow/core';
import type { ApiInputAnswerAnalysis } from '@openapi-flow/core';
import type { WorkflowDraftConversationState } from '../../types/workflow-draft-conversation.js';
import { draftConversationReviewToken } from './draft-conversation-review-token.js';

/** Revalidate separately captured source choices against the actual current question/reply. */
export function resolveDraftConversationInputAnswerExtraction(
  state: WorkflowDraftConversationState,
): ApiInputAnswerAnalysis {
  const response = state.response;
  const record = state.inputAnswerExtraction;
  if (response?.action !== 'reply-inputs' || !record || !state.questions)
    throw new Error(
      'Natural API input application requires its original extraction result',
    );
  const requirements = state.questions.flatMap((question) =>
    question.kind === 'api-input' && question.requirement
      ? [question.requirement]
      : [],
  );
  if (
    record.messageId !== response.messageId ||
    record.token !== response.token ||
    record.token !== draftConversationReviewToken(state) ||
    !isDeepStrictEqual(record.context, { reply: response.text, requirements })
  )
    throw new Error(
      'Natural API input extraction differs from the current reply or pending OAS contracts',
    );
  if (!Array.isArray(record.analysis.sources))
    throw new Error(
      'Natural API input extraction analysis.sources must be an array',
    );
  const resolved = resolveApiInputAnswerSources({
    reply: response.text,
    requirements,
    selections: record.analysis.sources.map((source) => ({
      requirementId: source.requirementId,
      sourceFormat: source.sourceFormat,
      sourceText: source.sourceText,
    })),
  });
  if (
    !isDeepStrictEqual(resolved, {
      answers: record.analysis.answers,
      sources: record.analysis.sources,
      unansweredRequirementIds: record.analysis.unansweredRequirementIds,
    })
  )
    throw new Error(
      'Natural API input extraction changed its code-resolved values, locations or unanswered questions',
    );
  if (
    record.analysis.status !==
    (response.text === '' ? 'empty-reply' : 'extracted')
  )
    throw new Error(
      'Natural API input extraction has an inconsistent analysis status',
    );
  if (record.analysis.extraction !== undefined) {
    validateApiInputAnswerExtractionRecord({
      reply: response.text,
      requirements,
      record: record.analysis.extraction,
    });
    if (!isDeepStrictEqual(record.analysis.extraction.verification, resolved))
      throw new Error(
        'Natural API input explanation differs from its applied source selection',
      );
  }
  return record.analysis;
}
