import { z } from 'zod';
import { apiOperationKeySchema } from './api-operation-key-schema.js';
import { apiInputMessageLiteralSourceSchema } from './api-input-literal-source-schema.js';
import { workflowNonemptySourceMessagesSchema } from './planning-evidence-schema.js';
import { requestedApiInputsSchema } from './requested-api-inputs-schema.js';
import { apiInputEnumAnswerSelectionsSchema } from './api-input-enum-answer-selection-schema.js';
import type {
  ApiInputAnswerContext,
  ApiInputAnswerSource,
} from '../types/api-input-answer-extraction.js';

export const apiInputRequirementSchema = z.strictObject({
  kind: z.enum(['missing-input', 'requested-input']),
  requestedInputs: requestedApiInputsSchema.optional(),
  id: z.string().min(1),
  callId: z.string().min(1),
  operation: apiOperationKeySchema,
  targetPointer: z.string().min(1),
  schema: z.union([z.boolean(), z.record(z.string(), z.json())]),
  openapiVersion: z.string().min(1),
  schemaDialect: z.literal('draft-2020-12').optional(),
  operationSummary: z.string().optional(),
  parameterDescription: z.string().optional(),
  message: z.string().min(1),
});

export const apiInputAnswerContextSchema = z.strictObject({
  reply: z.string(),
  sourceMessages: workflowNonemptySourceMessagesSchema.optional(),
  requirements: z.array(apiInputRequirementSchema),
  purpose: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0)
    .optional(),
  selectOasEnums: z.boolean().optional(),
}) satisfies z.ZodType<ApiInputAnswerContext>;

export const apiInputAnswerSourceSchema =
  apiInputMessageLiteralSourceSchema.extend({
    requirementId: z.string().min(1),
  }) satisfies z.ZodType<ApiInputAnswerSource>;

export const apiInputAnswerSourcesSchema = z.array(apiInputAnswerSourceSchema);

export const apiInputAnswerExtractionDecisionSchema = z.strictObject({
  reason: z.string().min(1),
  answers: z.array(
    apiInputAnswerSourceSchema.extend({ reason: z.string().min(1) }),
  ),
  enumSelections: apiInputEnumAnswerSelectionsSchema.optional(),
});
