import { z } from 'zod';
import type { ApiArgumentValues } from '../types/api-arguments.js';
import type {
  ApiLiteralGenerationContext,
  ApiLiteralGenerationRecord,
} from '../types/api-literal-generation.js';
import { apiOperationKeySchema } from './api-operation-key-schema.js';
import {
  planningEvidenceTextSchema,
  workflowNonemptySourceMessagesSchema,
} from './planning-evidence-schema.js';

export const apiLiteralSourceContextSchema = z.strictObject({
  scenario: planningEvidenceTextSchema,
  literalSourceMessages: workflowNonemptySourceMessagesSchema.optional(),
});

export const apiLiteralGenerationIdentitySchema =
  apiLiteralSourceContextSchema.extend({
    callId: planningEvidenceTextSchema,
    purpose: planningEvidenceTextSchema.optional(),
  });

export const apiLiteralGenerationOperationSchema = z.strictObject({
  key: apiOperationKeySchema,
  method: planningEvidenceTextSchema,
  path: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
});

export const apiLiteralGenerationContextSchema =
  apiLiteralSourceContextSchema.extend({
    purpose: planningEvidenceTextSchema.optional(),
    operation: apiLiteralGenerationOperationSchema,
    literalInputSchema: z.record(z.string(), z.unknown()),
    requestMediaType: planningEvidenceTextSchema.optional(),
  }) satisfies z.ZodType<ApiLiteralGenerationContext>;

export function createApiLiteralGenerationRecordSchema(
  valuesSchema: z.ZodType<ApiArgumentValues>,
) {
  return z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('not-needed'),
      callId: planningEvidenceTextSchema,
      operation: apiOperationKeySchema,
    }),
    z.strictObject({
      kind: z.literal('proposed-literals'),
      callId: planningEvidenceTextSchema,
      operation: apiOperationKeySchema,
      proposedValues: valuesSchema,
      explanation: z.strictObject({
        reason: planningEvidenceTextSchema.optional(),
        evidence: z.array(
          z.discriminatedUnion('kind', [
            z.strictObject({
              kind: z.literal('scenario'),
              text: z.string(),
              purpose: planningEvidenceTextSchema.optional(),
            }),
            z.strictObject({
              kind: z.literal('literal-source-messages'),
              messages: workflowNonemptySourceMessagesSchema,
            }),
            z.strictObject({
              kind: z.literal('literal-input-contract'),
              operation: apiLiteralGenerationOperationSchema,
              schema: z.record(z.string(), z.unknown()),
              requestMediaType: planningEvidenceTextSchema.optional(),
            }),
          ]),
        ),
      }),
    }),
  ]) satisfies z.ZodType<ApiLiteralGenerationRecord>;
}
