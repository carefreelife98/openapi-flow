import type {
  GenerateCatalogScenarioInput,
  GeneratedCatalogScenario,
} from './types/planning.js';
import { compileCatalogSequence } from '@openapi-flow/n8n/legacy';
import { proposeCatalogScenario } from '@openapi-flow/langchain/legacy';

export async function generateCatalogScenario(
  input: GenerateCatalogScenarioInput,
): Promise<GeneratedCatalogScenario> {
  const plan = await proposeCatalogScenario(input);
  return compileCatalogSequence({
    sources: input.sources,
    profile: input.profile,
    plan,
  });
}
