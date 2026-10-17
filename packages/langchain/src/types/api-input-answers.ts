import type { ApiInputRequirement } from '@openapi-flow/core';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { z } from 'zod';
import type { createApiInputAnswersSchema } from '@openapi-flow/core';

export interface ExtractApiInputAnswersInput {
  requirements: ApiInputRequirement[];
  reply: string;
  model: BaseChatModel;
}

export type ApiInputAnswersOutput = z.infer<
  ReturnType<typeof createApiInputAnswersSchema>
>;
export type ApiInputAnswerProposal = ApiInputAnswersOutput['answers'][number];
