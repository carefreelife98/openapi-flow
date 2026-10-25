import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { ZodType } from 'zod';
import type { JsonObject } from '@openapi-flow/core';

export interface InvokeStructuredModelInput<Output extends object> {
  model: BaseChatModel;
  schema: ZodType<Output> | JsonObject;
  name: string;
  operation: string;
  method: 'functionCalling' | 'jsonSchema';
  strict: boolean | undefined;
  messages: BaseMessage[];
  signal?: AbortSignal;
}
