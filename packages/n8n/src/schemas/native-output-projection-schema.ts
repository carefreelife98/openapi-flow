import { z } from 'zod';
import {
  createNativeOutputPointerSelectionSchema,
  isSchemaProvablyEmpty,
} from '@openapi-flow/core';
import type { NativeOutputContract } from '@openapi-flow/core';
import {
  outputFieldSelectionSchema,
  outputFieldSelectionParametersSchema,
} from './output-field-selection-schema.js';

export const nativeOutputMeasurementSchema = z.enum([
  'utf16-code-units',
  'array-items',
]);

export const nativeOutputProjectionParametersSchema =
  outputFieldSelectionParametersSchema.safeExtend({
    fields: z
      .array(
        outputFieldSelectionSchema.extend({
          measurement: nativeOutputMeasurementSchema
            .optional()
            .describe(
              'Explicit derived integer field only: utf16-code-units uses string.length, array-items uses array.length. Never choose a character-count unit or replace original data without a scenario requirement. Omit to copy the original value unchanged.',
            ),
        }),
      )
      .min(1),
    sourceNodeId: z
      .string()
      .min(1)
      .describe(
        'Exact declared native producer, not an API call or a future unconfigured role.',
      ),
  });

export function createNativeOutputProjectionParametersSchema(
  sources: NativeOutputContract[],
) {
  const variants = sources.flatMap((source) => {
    const pointer = createNativeOutputPointerSelectionSchema(source);
    if (isSchemaProvablyEmpty(z.toJSONSchema(pointer))) return [];
    const copied = outputFieldSelectionSchema.extend({ pointer });
    const measured = copied.extend({
      measurement: nativeOutputMeasurementSchema,
    });
    return [
      nativeOutputProjectionParametersSchema.safeExtend({
        sourceNodeId: z.literal(source.nodeId),
        fields: z
          .array(z.union([copied, measured]))
          .min(1)
          .describe(
            'Unchanged source fields or explicitly requested derived counts. Each measured field must state its counting unit; copied fields have no measurement property.',
          ),
      }),
    ];
  });
  return variants.length ? z.union(variants) : z.never();
}
