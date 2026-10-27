import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { WorkflowIntentInput } from '@openapi-flow/core';

export interface PlanWorkflowIntentInput extends WorkflowIntentInput {
  model: BaseChatModel;
  signal?: AbortSignal;
}
