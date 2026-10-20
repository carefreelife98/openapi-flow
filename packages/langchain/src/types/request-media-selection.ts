import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ApiOperationContract } from '@openapi-flow/core';
import type { z } from 'zod';
import type { createApiRequestMediaTypeSchema } from '../schemas/api-request-media-type-schema.js';

export interface SelectApiRequestMediaTypeInput {
  operation: ApiOperationContract;
  scenario: string;
  purpose?: string;
  model: BaseChatModel;
}

export interface AnalyzeApiRequestMediaTypeInput extends SelectApiRequestMediaTypeInput {
  /** Optional same-call model reason; code attaches unchanged request-body sources. */
  includeExplanations?: boolean;
}

export type ApiRequestMediaTypeOutput = z.infer<
  ReturnType<typeof createApiRequestMediaTypeSchema>
>;
