import { z } from 'zod';
import { createApiRequestInputPointerSchema } from '@openapi-flow/core';
import type { ApiLiteralGenerationDescription } from '@openapi-flow/core';

/** Original OAS values remain visible, including actual enum values; no source/character IDs. */
export function createWorkflowApiValueGenerationSchema(
  descriptions: ApiLiteralGenerationDescription[],
) {
  return z.strictObject({
    calls: z.strictObject(
      Object.fromEntries(
        descriptions.map(({ input: call, contract }) => {
          return [
            call.callId,
            z.strictObject({
              values: contract.valuesSchema,
              requestedInputs: z.array(
                createApiRequestInputPointerSchema(
                  z.toJSONSchema(contract.valuesSchema),
                ),
              ),
            }),
          ];
        }),
      ),
    ),
  });
}
