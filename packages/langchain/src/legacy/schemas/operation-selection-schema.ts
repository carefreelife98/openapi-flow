import { z } from 'zod';

export function createOperationSelectionSchema(refs: string[]) {
  if (refs.length === 0) {
    throw new Error('spec.paths has no operations to select');
  }
  return z
    .object({
      operationRef: z
        .enum(refs)
        .describe(
          'The exact operationRef of the single OpenAPI operation that best matches the scenario. Choose one of the supplied references; do not invent a new one.',
        ),
    })
    .strict()
    .describe('The OpenAPI operation selected for the user scenario.');
}
