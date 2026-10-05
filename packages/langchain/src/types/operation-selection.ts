import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ApiOperationCandidate } from '@openapi-flow/core';
import type { z } from 'zod';
import type { createApiSelectionSchema } from '../schemas/api-selection-schema.js';

export interface SelectApiOperationsInput {
  operations: ApiOperationCandidate[];
  scenario: string;
  model: BaseChatModel;
}
export type ApiSelectionOutput = z.infer<
  ReturnType<typeof createApiSelectionSchema>
>;
