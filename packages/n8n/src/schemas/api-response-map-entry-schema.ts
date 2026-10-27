import { z } from 'zod';
import { createApiResponsePointerSelectionSchema } from '@openapi-flow/core';
import type {
  ApiBindingMaterial,
  WorkflowCapabilityPlanningContext,
} from '@openapi-flow/core';

export const apiResponseMapEntryParametersSchema = z.strictObject({
  sourceNodeId: z
    .string()
    .min(1)
    .describe(
      'Existing API callId supplying the original OAS response object.',
    ),
  pointer: z
    .string()
    .describe(
      'RFC 6901 pointer to the containing object/map, not the selected entry or an array.',
    ),
  key: z
    .string()
    .describe(
      'Exact object key supplied by the scenario or an explicit runtime input. Preserve empty keys, slashes, tildes and numeric strings; never invent a group or take the first entry.',
    ),
});

export const apiResponseMapEntryStructureSchema =
  apiResponseMapEntryParametersSchema.partial({ key: true });

export function createApiResponseMapEntryParametersSchema(
  materials: ApiBindingMaterial[],
) {
  const ids = materials.map((material) => material.callId);
  return apiResponseMapEntryParametersSchema.extend({
    sourceNodeId: ids.length ? z.enum(ids) : z.never(),
    pointer: z.string().regex(/^(?:\/(?:[^~/]|~[01])*)*$/),
  });
}

/** Model candidates are separate from the declarative runtime validator; OAS projection is checked by Core. */
export function createApiResponseMapEntryBoundPlanningSchema(
  materials: ApiBindingMaterial[],
) {
  const [first, ...rest] = materials.map(({ callId, operation }) =>
    apiResponseMapEntryParametersSchema.extend({
      sourceNodeId: z.literal(callId),
      pointer: createApiResponsePointerSelectionSchema({
        operation,
        valueKind: 'value',
      }),
    }),
  );
  return first === undefined ? z.never() : z.union([first, ...rest]);
}

export function createApiResponseMapEntryPlanningParametersSchema({
  apiCallIds,
}: WorkflowCapabilityPlanningContext) {
  return apiResponseMapEntryParametersSchema.extend({
    sourceNodeId: apiCallIds.length ? z.enum(apiCallIds) : z.never(),
  });
}
