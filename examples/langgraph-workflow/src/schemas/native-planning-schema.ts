import { z } from 'zod';
import type { StagedNativePlanningOptions } from '../types/native-planning.js';
import type { NativeNodeParameterQuestion } from '@openapi-flow/core';
import { nativeSelectionPlanningPolicySchema } from './native-selection-planning-state-schema.js';
import type { NativeSelectionPlanningObserver } from '../types/native-selection-planning.js';

export const stagedNativePlanningOptionsSchema = z.strictObject({
  mode: z.literal('staged'),
  allowRuntimeParameters: z.boolean().optional(),
  planDependencies: z.boolean().optional(),
  selectionReview: z
    .strictObject({
      policy: nativeSelectionPlanningPolicySchema,
      observe: z
        .custom<NativeSelectionPlanningObserver>(
          (value) => typeof value === 'function',
        )
        .optional(),
    })
    .optional(),
}) satisfies z.ZodType<StagedNativePlanningOptions>;

export function createNativeConfigurationResponseSchema(
  questions: NativeNodeParameterQuestion[],
) {
  if (!questions.length)
    throw new Error('Native configuration response requires actual questions');
  return z.discriminatedUnion('action', [
    z.strictObject({
      action: z.literal('reply'),
      questionId: z.enum(questions.map((question) => question.id)),
      text: z
        .string()
        .regex(
          /\S/u,
          'Native configuration reply must contain non-whitespace text',
        ),
    }),
    z.strictObject({ action: z.literal('cancel') }),
  ]);
}
