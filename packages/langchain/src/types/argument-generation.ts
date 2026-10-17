import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ApiArgumentGenerationInput } from '@openapi-flow/core';

export interface GenerateApiArgumentsInput extends ApiArgumentGenerationInput {
  callId: string;
  scenario: string;
  model: BaseChatModel;
}
