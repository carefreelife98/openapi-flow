import { z } from 'zod';
import {
  createApiResponsePointerSelectionSchema,
  isSchemaProvablyEmpty,
} from '@openapi-flow/core';
import type { ApiBindingMaterial } from '@openapi-flow/core';
import {
  outputFieldSelectionSchema,
  outputFieldSelectionParametersSchema,
} from './output-field-selection-schema.js';

const apiResponseObjectFieldSchema = outputFieldSelectionSchema.extend({
  name: outputFieldSelectionSchema.shape.name.describe(
    'Workflow-local output property label, not API request data or a value copied from the response. Preserve a name explicitly requested by the user. If a new result has no requested label, choose a concise unique label from its requested role or supplied API metadata. This label is workflow configuration, not missing business input. Dots are literal characters, not nesting instructions.',
  ),
  sourceNodeId: z
    .string()
    .min(1)
    .describe(
      'An existing selected API callId, never an operation name or invented producer.',
    ),
  pointer: outputFieldSelectionSchema.shape.pointer.describe(
    'RFC 6901 pointer into the unchanged API response body; empty string selects the whole body.',
  ),
});

export const apiResponseObjectParametersSchema =
  outputFieldSelectionParametersSchema.safeExtend({
    fields: z
      .array(apiResponseObjectFieldSchema)
      .min(1)
      .describe(
        'Explicit named output fields. Each value is copied unchanged from the declared OAS response. No formatting, casting, merging, calculations or inferred matching.',
      ),
  });

export function createApiResponseObjectParametersSchema(callIds: string[]) {
  return apiResponseObjectParametersSchema.safeExtend({
    fields: z
      .array(
        apiResponseObjectFieldSchema.extend({
          sourceNodeId: (callIds.length ? z.enum(callIds) : z.never()).describe(
            'Only a supplied API callId. Code derives the output schema from this source contract.',
          ),
        }),
      )
      .min(1),
  });
}

/** Couple each source choice to its original OAS paths; never cross-product unrelated APIs' pointers. */
export function createApiResponseObjectBoundParametersSchema(
  materials: ApiBindingMaterial[],
) {
  const [first, ...rest] = materials.flatMap(({ callId, operation }) => {
    const pointer = createApiResponsePointerSelectionSchema({
      operation,
      valueKind: 'value',
    });
    if (isSchemaProvablyEmpty(z.toJSONSchema(pointer))) return [];
    return [
      apiResponseObjectFieldSchema.extend({
        sourceNodeId: z.literal(callId),
        pointer,
      }),
    ];
  });
  return apiResponseObjectParametersSchema.safeExtend({
    fields: z
      .array(first === undefined ? z.never() : z.union([first, ...rest]))
      .min(1),
  });
}
