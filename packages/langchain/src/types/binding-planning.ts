import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ApiBindingMaterial } from '@openapi-flow/core';

export interface PlanApiBindingsInput {
  scenario: string;
  materials: ApiBindingMaterial[];
  model: BaseChatModel;
}
