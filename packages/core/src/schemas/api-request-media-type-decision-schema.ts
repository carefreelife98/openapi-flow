import { z } from 'zod';
import type {
  ApiRequestMediaTypeContext,
  ApiRequestMediaTypeDecision,
  ProposedApiRequestMediaTypeAssessment,
} from '../types/api-request-media-type-decision.js';
import { apiOperationKeySchema } from './api-operation-key-schema.js';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';
import { optionalPlanningExplanationObjectSchema } from './optional-planning-explanation-schema.js';

export const apiRequestMediaTypeContextSchema = z.strictObject({
  scenario: planningEvidenceTextSchema,
  purpose: planningEvidenceTextSchema.optional(),
  operation: z.strictObject({
    key: apiOperationKeySchema,
    method: planningEvidenceTextSchema,
    path: z.string(),
    requestBody: z.record(z.string(), z.unknown()).optional(),
  }),
  mediaTypes: z.array(z.string().min(1)),
}) satisfies z.ZodType<ApiRequestMediaTypeContext>;

export const apiRequestMediaTypeAssessmentProposalSchema = z.strictObject({
  requestMediaType: z.string().min(1).nullable(),
  explanation: optionalPlanningExplanationObjectSchema,
}) satisfies z.ZodType<ProposedApiRequestMediaTypeAssessment>;

const explanationSchema = z.strictObject({
  reason: planningEvidenceTextSchema,
  evidence: z.array(
    z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('scenario'),
        text: z.string(),
        purpose: planningEvidenceTextSchema.optional(),
      }),
      z.strictObject({
        kind: z.literal('oas-request-body'),
        operation: apiOperationKeySchema,
        pointer: z.literal('/requestBody'),
        value: z.record(z.string(), z.unknown()),
      }),
    ]),
  ),
});
const decisionFields = {
  operation: apiOperationKeySchema,
  declaredMediaTypes: z.array(z.string().min(1)),
};

export const apiRequestMediaTypeDecisionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...decisionFields, kind: z.literal('no-request-body') }),
  z.strictObject({
    ...decisionFields,
    kind: z.literal('single-declared-format'),
    requestMediaType: z.string().min(1),
  }),
  z.strictObject({
    ...decisionFields,
    kind: z.literal('model-selection'),
    requestMediaType: z.string().min(1),
    assessment: z.strictObject({
      requestMediaType: z.string().min(1),
      explanation: explanationSchema.optional(),
    }),
  }),
  z.strictObject({
    ...decisionFields,
    kind: z.literal('documented-default'),
    requestMediaType: z.string().min(1),
    policy: z.literal('json-form-concrete-wildcard-code-point'),
    assessment: z.strictObject({
      requestMediaType: z.null(),
      explanation: explanationSchema.optional(),
    }),
  }),
]) satisfies z.ZodType<ApiRequestMediaTypeDecision>;
