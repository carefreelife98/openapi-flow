import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ApiArgumentsSchemaInput } from '@openapi-flow/core';

export interface GenerateApiArgumentsInput extends ApiArgumentsSchemaInput {
  callId: string;
  scenario: string;
  model: BaseChatModel;
}
