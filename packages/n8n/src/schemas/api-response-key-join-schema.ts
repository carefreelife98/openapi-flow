import { z } from 'zod';
import type {
  ApiBindingMaterial,
  WorkflowCapabilityPlanningContext,
} from '@openapi-flow/core';
import {
  createApiResponsePointerSelectionSchema,
  isSchemaProvablyEmpty,
} from '@openapi-flow/core';

const keySourceSchema = z.strictObject({
  sourceNodeId: z
    .string()
    .min(1)
    .describe('Existing API callId providing this side of the join.'),
  pointer: z
    .string()
    .regex(/^(?:\/(?:[^~/]|~[01])*)*$/)
    .describe('RFC 6901 pointer to the response array, not its first item.'),
  keyPointer: z
    .string()
    .regex(/^(?:\/(?:[^~/]|~[01])*)*$/)
    .describe(
      'RFC 6901 pointer relative to each unchanged array element selecting the business key. Empty string compares the entire element. Never infer keys by field name.',
    ),
});

export const apiResponseKeyJoinParametersSchema = z.strictObject({
  left: keySourceSchema,
  right: keySourceSchema,
  joinMode: z
    .enum(['inner', 'full', 'left', 'right'])
    .describe(
      'Explicit row retention: matching pairs only, all rows, all left rows or all right rows. Duplicate keys produce every matching pair, never only the first.',
    ),
  missingKeys: z
    .enum(['error', 'unmatched'])
    .describe(
      'Explicit handling of absent key paths: reject the response or retain the row as unmatched according to joinMode. Missing keys never match each other; null is an actual key value.',
    ),
});

export function createApiResponseKeyJoinParametersSchema(
  materials: ApiBindingMaterial[],
) {
  const [first, ...rest] = materials.flatMap(({ callId, operation }) => {
    const pointer = createApiResponsePointerSelectionSchema({
      operation,
      valueKind: 'array',
    });
    return isSchemaProvablyEmpty(z.toJSONSchema(pointer))
      ? []
      : [keySourceSchema.extend({ sourceNodeId: z.literal(callId), pointer })];
  });
  const source = first === undefined ? z.never() : z.union([first, ...rest]);
  return apiResponseKeyJoinParametersSchema.extend({
    left: source,
    right: source,
  });
}

export function createApiResponseKeyJoinPlanningSchema({
  apiCallIds,
}: WorkflowCapabilityPlanningContext) {
  const source = keySourceSchema.extend({
    sourceNodeId: apiCallIds.length ? z.enum(apiCallIds) : z.never(),
  });
  return apiResponseKeyJoinParametersSchema.extend({
    left: source,
    right: source,
  });
}
