import type { ApiInputRequirement } from '@openapi-flow/core';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { z } from 'zod';
import type { createApiInputAnswerSourceSchema } from '../schemas/api-input-answer-source-schema.js';

export interface ExtractApiInputAnswersInput {
  requirements: ApiInputRequirement[];
  reply: string;
  model: BaseChatModel;
  selectOasEnums?: boolean;
  purpose?: string;
}

export interface AnalyzeApiInputAnswersInput extends Omit<
  ExtractApiInputAnswersInput,
  'model'
> {
  /** Required only when pending questions and a nonempty reply need interpretation. */
  model?: BaseChatModel;
  includeExplanations?: boolean;
}

export type ApiInputAnswersOutput = z.infer<
  ReturnType<typeof createApiInputAnswerSourceSchema>
>;
export type ApiInputAnswerProposal = ApiInputAnswersOutput['answers'][number];
