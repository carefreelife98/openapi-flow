import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ApiValueAnswerContext } from '@openapi-flow/core';

export interface AnalyzeApiValueAnswersInput extends ApiValueAnswerContext {
  model?: BaseChatModel;
  signal?: AbortSignal;
}
