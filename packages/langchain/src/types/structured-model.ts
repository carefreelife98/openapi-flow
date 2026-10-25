import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { ZodType } from 'zod';

export interface InvokeStructuredModelInput<Output extends object> {
  model: BaseChatModel;
  schema: ZodType<Output>;
  name: string;
  operation: string;
  method: 'functionCalling' | 'jsonSchema';
  messages: BaseMessage[];
}
