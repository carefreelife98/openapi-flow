import type { SelectApiRequestMediaTypeInput } from '../types/request-media-selection.js';
import { analyzeApiRequestMediaType } from './analyze-api-request-media-type.js';

export async function selectApiRequestMediaType(
  input: SelectApiRequestMediaTypeInput,
): Promise<string | undefined> {
  const decision = await analyzeApiRequestMediaType({
    operation: input.operation,
    scenario: input.scenario,
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
    model: input.model,
  });
  return decision.requestMediaType;
}
