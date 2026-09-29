import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { CompileRequest } from './request-workflow.js';

export interface GenerateRequest extends Omit<CompileRequest, 'plan'> {
  scenario: string;
  model: BaseChatModel;
  requestMediaType?: string;
}
