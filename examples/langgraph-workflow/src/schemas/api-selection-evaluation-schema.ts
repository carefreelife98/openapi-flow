import { z } from 'zod';

export const evaluationOperationSchema = z.strictObject({
  documentId: z.string().min(1),
  operationRef: z.string().min(1),
});

export const apiSelectionEvaluationDatasetSchema = z.strictObject({
  version: z.literal(2),
  repeats: z.number().int().positive(),
  sources: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        specFile: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(1),
  cases: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        cohort: z.enum(['development', 'holdout']),
        scenario: z.string().min(1),
        expectedOperations: z.array(evaluationOperationSchema),
        expectedGap: z.boolean(),
      }),
    )
    .min(1),
});

export const evaluationTokenUsageSchema = z.strictObject({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});

export const evaluationGenerationUsageSchema = z.object({
  message: z.object({
    usage_metadata: evaluationTokenUsageSchema.passthrough(),
  }),
});

export const evaluationTransportStatusSchema = z.object({
  status: z.number().int(),
});
export const evaluationModelHeadersSchema = z.record(z.string(), z.string());
