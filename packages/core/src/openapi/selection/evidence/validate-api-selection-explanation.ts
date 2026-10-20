import { isDeepStrictEqual } from 'node:util';
import type { ValidateApiSelectionExplanationInput } from '../../../types/api-selection-evidence.js';
import { apiSelectionExplanationSchema } from '../../../schemas/api-selection-evidence-schema.js';
import { createApiSelectionExplanation } from './create-api-selection-explanation.js';

/** Exact provenance is checked; semantic entailment of the reason is not proved. */
export function validateApiSelectionExplanation(
  input: ValidateApiSelectionExplanationInput,
): void {
  const explanation = apiSelectionExplanationSchema.parse(input.explanation);
  const expected = createApiSelectionExplanation({
    context: input.context,
    basis: input.basis,
    reason: explanation.reason,
  });
  if (!isDeepStrictEqual(expected, explanation))
    throw new Error(
      'API selection explanation evidence differs from the supplied scenario or discovery basis',
    );
}
