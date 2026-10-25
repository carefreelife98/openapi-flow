import type { ValidateApiCallBindingPlanInput } from '../../types/api-call-binding-planning.js';
import { apiCallBindingPlanSchema } from '../../schemas/api-call-binding-planning-schema.js';
import { resolveApiCallBindingPlan } from './resolve-api-call-binding-plan.js';
import { jsonValuesEqual } from '../../utils/json-values-equal.js';

/** Re-derive resumable data from the same original contracts; never silently rebase it. */
export function validateApiCallBindingPlan(
  input: ValidateApiCallBindingPlanInput,
): void {
  const result = apiCallBindingPlanSchema.parse(input.result);
  const expected = resolveApiCallBindingPlan({
    ...input,
    sources: result.sources,
    proposal: {
      bindings: result.bindings.map(
        ({ targetPointer, sourceNodeId, sourcePointer }) => ({
          targetPointer,
          sourceNodeId,
          sourcePointer,
        }),
      ),
      gaps: result.gaps
        .slice(result.sources.gaps.length)
        .map(({ targetPointer, description }) => ({
          targetPointer,
          description,
        })),
      ...(result.reason === undefined ? {} : { reason: result.reason }),
    },
  });
  if (!jsonValuesEqual(result, expected))
    throw new Error(
      'completed API binding call differs from its original source snapshot or proposal',
    );
}
