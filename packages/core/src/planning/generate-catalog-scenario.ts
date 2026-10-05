import type {
  GenerateCatalogScenarioInput,
  GeneratedCatalogScenario,
} from '../types/catalog-planning.js';
import { compileCatalogSequence } from '../workflow/request/compile-catalog-sequence.js';
import { proposeCatalogScenario } from './propose-catalog-scenario.js';

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
