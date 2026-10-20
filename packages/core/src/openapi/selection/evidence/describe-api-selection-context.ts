import type { ApiSelectionContext } from '../../../types/api-selection-evidence.js';
import { apiSelectionContextSchema } from '../../../schemas/api-selection-evidence-schema.js';
import { apiOperationKeyEquals } from '../../catalog/api-operation-key-equals.js';

/** Snapshot exactly the supplied discovery boundary before an asynchronous call. */
export function describeApiSelectionContext(
  input: ApiSelectionContext,
): ApiSelectionContext {
  const context = apiSelectionContextSchema.parse(input);
  for (const [index, candidate] of context.operations.entries())
    if (
      context.operations
        .slice(0, index)
        .some((prior) => apiOperationKeyEquals(prior.key, candidate.key))
    )
      throw new Error(
        `API selection context.operations[${index}].key duplicates a discovery candidate`,
      );
  return context;
}
