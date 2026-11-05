import { z } from 'zod';
import { deduplicateCanonicalSchemaResources } from '@openapi-flow/core';
import type {
  ApiArgumentGenerationContract,
  ApiLiteralTargetContract,
  JsonObject,
  WorkflowSourceMessage,
} from '@openapi-flow/core';
import type { ApiLiteralGenerationOutputSchema } from '../types/argument-generation.js';
import { createApiLiteralGenerationOutputSchema } from './api-literal-generation-output-schema.js';

/** Preserve the selected requested-input plan in both runtime and provider-facing contracts. */
export function createScopedApiLiteralOutputSchema(
  contract: ApiArgumentGenerationContract,
  includeExplanations: boolean,
  requestSchema: JsonObject,
  messages: WorkflowSourceMessage[],
  targets: ApiLiteralTargetContract[],
  requestedInputs: string[],
  requireExplanations = true,
): ApiLiteralGenerationOutputSchema {
  const base = createApiLiteralGenerationOutputSchema(
    contract,
    includeExplanations,
    requestSchema,
    messages,
    requireExplanations,
    false,
    targets,
  );
  const wire = z.toJSONSchema(
    createApiLiteralGenerationOutputSchema(
      contract,
      includeExplanations,
      requestSchema,
      messages,
      true,
      false,
      targets,
    ),
  ) as JsonObject;
  const properties = wire.properties as Record<string, JsonObject>;
  properties.requestedInputs = {
    type: 'array',
    items: { type: 'string' },
    const: requestedInputs,
  };
  const canonical = deduplicateCanonicalSchemaResources(wire);
  if (typeof canonical === 'boolean')
    throw new Error('Scoped literal output requires an object schema');
  return base
    .superRefine((output, context) => {
      if (
        !('requestedInputs' in output) ||
        JSON.stringify(output.requestedInputs) !==
          JSON.stringify(requestedInputs)
      )
        context.addIssue({
          code: 'custom',
          message: 'Source selection changed the requested input plan',
        });
    })
    .meta(canonical);
}
