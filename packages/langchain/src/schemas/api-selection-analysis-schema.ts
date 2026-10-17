import { z } from 'zod';
import { createApiSelectionSchema } from './api-selection-schema.js';

export function createApiSelectionAnalysisSchema(candidateIds: string[]) {
  return createApiSelectionSchema(candidateIds).extend({
    questions: z
      .array(
        z.strictObject({
          message: z
            .string()
            .min(1)
            .describe(
              'Ask only a consequential unresolved API-role choice. Do not ask for request values before reading full contracts.',
            ),
          purpose: z
            .string()
            .min(1)
            .describe(
              'The one user-requested role that will be fulfilled by exactly one offered candidate.',
            ),
          candidateIds: z
            .array(z.enum(candidateIds))
            .min(2)
            .describe(
              'Distinct supplied alternatives for this role, not API calls that should all run.',
            ),
        }),
      )
      .describe(
        'Empty when the requested API scope is clear. Multiple available APIs alone is not ambiguity. Never expand a short request into unrelated actions.',
      ),
  });
}
