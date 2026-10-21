import { z } from 'zod';
import { createApiSelectionSchema } from './api-selection-schema.js';
import { withApiSelectionExplanation } from './with-api-selection-explanation.js';

export function createApiSelectionAnalysisSchema(
  candidateIds: string[],
  includeExplanations = false,
) {
  const single = z.strictObject({
    kind: z
      .literal('single-choice')
      .describe('Choose one interchangeable API for one unresolved role.'),
    message: z
      .string()
      .min(1)
      .describe(
        'Ask a consequential scope question. Wording must match kind and selection counts.',
      ),
    purpose: z
      .string()
      .min(1)
      .describe(
        'The user-requested role or collection scope resolved by this question.',
      ),
    candidateIds: z
      .array(z.enum(candidateIds))
      .min(2)
      .describe('Distinct supplied alternatives; exactly one will be chosen.'),
  });
  const multiple = single.extend({
    kind: z
      .literal('multiple-choice')
      .describe(
        'The user must choose a subset of APIs that can all be used together.',
      ),
    candidateIds: z
      .array(z.enum(candidateIds))
      .min(1)
      .describe(
        'Distinct offered APIs for the selectable collection scope, not unrelated additions.',
      ),
    minSelections: z
      .number()
      .int()
      .nonnegative()
      .safe()
      .describe(
        'Minimum selections explicitly needed by the user; zero only when selecting none is allowed.',
      ),
    maxSelections: z
      .number()
      .int()
      .nonnegative()
      .safe()
      .describe(
        'Maximum selections allowed by the user and offered candidate count. Must be at least minSelections.',
      ),
  });
  return createApiSelectionSchema(candidateIds, includeExplanations).extend({
    questions: z
      .array(
        // Literal kinds remain disjoint; z.union emits the provider-supported anyOf.
        z.union([
          withApiSelectionExplanation(single, includeExplanations),
          withApiSelectionExplanation(multiple, includeExplanations),
        ]),
      )
      .describe(
        'Empty when the requested API scope is clear. Multiple available APIs alone is not ambiguity. Never expand a short request into unrelated actions.',
      ),
  });
}
