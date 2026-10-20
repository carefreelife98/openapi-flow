import type { ApiSelectionModelOptions } from '../types/operation-selection.js';
import { apiSelectionOptionsSchema } from '../schemas/api-selection-options-schema.js';

/** Optional standalone selector feature; absence preserves the non-explanation API. */
export function resolveApiSelectionOptions(
  input: ApiSelectionModelOptions,
): boolean {
  const options = apiSelectionOptionsSchema.parse(input);
  return options.includeExplanations === true;
}
