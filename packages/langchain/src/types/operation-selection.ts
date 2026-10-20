import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ApiOperationCandidate } from '@openapi-flow/core';
import type { z } from 'zod';
import type { createApiSelectionSchema } from '../schemas/api-selection-schema.js';

export interface ApiSelectionModelOptions {
  /** Opt in to reasons in the same call and code-owned discovery evidence. */
  includeExplanations?: boolean;
}

export interface SelectApiOperationsInput extends ApiSelectionModelOptions {
  operations: ApiOperationCandidate[];
  scenario: string;
  model: BaseChatModel;
}
export type ApiSelectionOutput = z.infer<
  ReturnType<typeof createApiSelectionSchema>
>;
