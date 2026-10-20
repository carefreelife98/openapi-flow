import { z } from 'zod';
import { apiOperationKeySchema } from './api-operation-key-schema.js';
import { apiInputLiteralSourceSchema } from './api-input-literal-source-schema.js';
import { requestedApiInputsSchema } from './requested-api-inputs-schema.js';

export const apiInputRequirementSchema = z.strictObject({
  kind: z.enum(['missing-input', 'requested-input']),
  requestedInputs: requestedApiInputsSchema.optional(),
  id: z.string().min(1),
  callId: z.string().min(1),
  operation: apiOperationKeySchema,
  targetPointer: z.string().min(1),
  schema: z.union([z.boolean(), z.record(z.string(), z.json())]),
  openapiVersion: z.string().min(1),
  operationSummary: z.string().optional(),
  parameterDescription: z.string().optional(),
  message: z.string().min(1),
});

export const apiInputAnswerContextSchema = z.strictObject({
  reply: z.string(),
  requirements: z.array(apiInputRequirementSchema),
});

export const apiInputAnswerSourceSchema = apiInputLiteralSourceSchema.extend({
  requirementId: z.string().min(1),
});

export const apiInputAnswerSourcesSchema = z.array(apiInputAnswerSourceSchema);

export const apiInputAnswerExtractionDecisionSchema = z.strictObject({
  reason: z.string().min(1),
  answers: z.array(
    apiInputAnswerSourceSchema.extend({ reason: z.string().min(1) }),
  ),
});
