import { z } from 'zod';
import type { StagedNativePlanningOptions } from '../types/native-planning.js';
import type { NativeNodeParameterQuestion } from '@openapi-flow/core';

export const stagedNativePlanningOptionsSchema = z.strictObject({
  mode: z.literal('staged'),
  allowRuntimeParameters: z.boolean().optional(),
  planDependencies: z.boolean().optional(),
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
