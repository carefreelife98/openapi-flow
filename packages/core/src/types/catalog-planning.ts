import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { z } from 'zod';
import type { CatalogSource } from './catalog.js';
import type { CatalogSequenceResult } from './catalog-workflow.js';
import type { CompileRequest } from './request-workflow.js';
import type { createCatalogSelectionSchema } from '../schemas/catalog-selection-schema.js';
import type { createCatalogStepSchema } from '../schemas/catalog-step-schema.js';

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

export interface GenerateCatalogScenarioInput extends ProposeCatalogScenarioInput {
  profile: CompileRequest['profile'];
}

export type GeneratedCatalogScenario = CatalogSequenceResult;
