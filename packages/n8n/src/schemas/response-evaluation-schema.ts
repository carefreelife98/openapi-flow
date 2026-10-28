import { z } from 'zod';
import type { WorkflowCapabilityPlanningContext } from '@openapi-flow/core';
import {
  nativeResponseOperandSchema,
  nativeOutputOperandSchema,
  nativeLiteralOperandSchema,
  nativeCheckSchema,
} from './native-capability-schemas.js';
import { outputFieldSelectionSchema } from './output-field-selection-schema.js';
import { createPlanningReferenceSchemas } from './create-native-comparison-planning-schema.js';

export const responseEvaluationStatusSchema = z.enum([
  'normal',
  'warning',
  'abnormal',
  'undetermined',
]);
export const responseEvaluationSourceSchema = z.union([
  nativeResponseOperandSchema,
  nativeOutputOperandSchema,
]);
const evaluationCase = z.union([
  z.strictObject({
    operator: nativeCheckSchema.shape.operator.extract(['equals', 'notEquals']),
    expected: nativeLiteralOperandSchema.shape.value,
    status: responseEvaluationStatusSchema,
  }),
  z.strictObject({
    operator: nativeCheckSchema.shape.operator.extract([
      'greaterThan',
      'lessThan',
    ]),
    expected: z.number(),
    status: responseEvaluationStatusSchema,
  }),
]);

export const responseEvaluationComparisonSchema = z.strictObject({
  kind: z.literal('compare'),
  source: responseEvaluationSourceSchema,
  scope: z
    .enum(['value', 'array-items', 'object-values'])
    .describe(
      'Evaluate the selected value once, or every unchanged array item/object value. Empty collections produce one undetermined result, never vacuous success.',
    ),
  valuePointer: outputFieldSelectionSchema.shape.pointer.describe(
    'RFC 6901 pointer relative to the selected value or each scoped item. Choose declared fields only. Missing optional values are undetermined; original contract violations still fail.',
  ),
  measurement: z
    .enum(['value', 'array-length'])
    .describe(
      'value keeps the exact original JSON value. array-length derives a separate nonnegative integer and never replaces the original array.',
    ),
  cases: z
    .array(evaluationCase)
    .min(1)
    .describe(
      'Ordered, scenario-defined scalar comparisons. First matching case wins. Code performs strict equality/numeric comparison; never supply code or service-specific defaults.',
    ),
  otherwise: responseEvaluationStatusSchema.describe(
    'Explicit outcome when a present, valid value matches no case. Not used for absent values or empty iterated collections.',
  ),
});
export const responseEvaluationUnassessedSchema = z.strictObject({
  kind: z
    .literal('unassessed')
    .describe(
      'The scenario requires a reported observation but supplies no supported decision rule. Produces undetermined, not normal.',
    ),
  source: responseEvaluationSourceSchema,
});
export const responseEvaluationParametersSchema = z.strictObject({
  checks: z
    .array(
      z.union([
        responseEvaluationComparisonSchema,
        responseEvaluationUnassessedSchema,
      ]),
    )
    .min(1),
});

export function createResponseEvaluationPlanningSchema(
  context: WorkflowCapabilityPlanningContext,
) {
  const references = createPlanningReferenceSchemas(context);
  const source = references.length ? z.union(references) : z.never();
  return responseEvaluationParametersSchema.extend({
    checks: z
      .array(
        z.union([
          responseEvaluationComparisonSchema.extend({ source }),
          responseEvaluationUnassessedSchema.extend({ source }),
        ]),
      )
      .min(1),
  });
}
