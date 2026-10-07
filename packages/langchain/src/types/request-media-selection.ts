import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ApiOperationContract } from '@openapi-flow/core';

export interface SelectApiRequestMediaTypeInput {
  operation: ApiOperationContract;
  scenario: string;
  model: BaseChatModel;
}

export interface ApiRequestMediaTypeOutput {
  requestMediaType: string | null;
}
