import { z } from 'zod';
import {
  createApiResponsePointerSelectionSchema,
  isSchemaProvablyEmpty,
} from '@openapi-flow/core';
import type {
  ApiBindingMaterial,
  WorkflowCapabilityPlanningContext,
} from '@openapi-flow/core';

export const responseArrayParametersSchema = z.strictObject({
  sourceNodeId: z
    .string()
    .min(1)
    .describe(
      'Existing API callId whose declared OAS response contains the scenario-required array.',
    ),
  pointer: z
    .string()
    .describe(
      'RFC 6901 pointer into that response body selecting the array. Empty string selects an array body. Never select a first element instead of iterating.',
    ),
});

export function createResponseArrayParametersSchema(
  materials: ApiBindingMaterial[],
) {
  if (!materials.length)
    throw new Error('array parameters require API materials');
  const [first, ...rest] = materials.flatMap(({ callId, operation }) => {
    const pointer = createApiResponsePointerSelectionSchema({
      operation,
      valueKind: 'array',
    });
    if (isSchemaProvablyEmpty(z.toJSONSchema(pointer))) return [];
    return [
      responseArrayParametersSchema.extend({
        sourceNodeId: z.literal(callId),
        pointer,
      }),
    ];
  });
  if (first === undefined) return z.never();
  // Distinct literal IDs keep the alternatives disjoint; union emits provider-supported anyOf.
  return z.union([first, ...rest]);
}

export function createResponseArrayPlanningParametersSchema({
  apiCallIds,
}: WorkflowCapabilityPlanningContext) {
  return responseArrayParametersSchema.extend({
    sourceNodeId: apiCallIds.length ? z.enum(apiCallIds) : z.never(),
  });
}
