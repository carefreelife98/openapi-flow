import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { z } from 'zod';
import type { CatalogSource } from '@openapi-flow/core/internal';
import type { createCatalogSelectionSchema } from '../../legacy/schemas/catalog-selection-schema.js';
import type { createCatalogStepSchema } from '../../legacy/schemas/catalog-step-schema.js';

export type CatalogSelectionOutput = z.infer<
  ReturnType<typeof createCatalogSelectionSchema>
>;
export type CatalogStepOutput = z.infer<
  ReturnType<typeof createCatalogStepSchema>
>;

export interface PriorStepSummary {
  id: string;
  responseFields: string[];
}

export interface ProposeCatalogScenarioInput {
  sources: CatalogSource[];
  scenario: string;
  model: BaseChatModel;
}
