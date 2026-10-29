import { z } from 'zod';
import type {
  ApiBindingPlanningContext,
  ApiBindingPlanningMaterial,
  ApiBindingPlanningRecord,
} from '../types/api-binding-planning.js';
import type { NativeOutputContract } from '../types/node-output.js';
import type {
  ApiParameterObject,
  ApiServerObject,
} from '../types/api-operation.js';
import { apiOperationKeySchema } from './api-operation-key-schema.js';
import {
  planningEvidenceTextSchema,
  workflowNonemptySourceMessagesSchema,
} from './planning-evidence-schema.js';

export const apiBindingPlanningIdentitySchema = z.strictObject({
  scenario: planningEvidenceTextSchema,
});

/** Validate the resolved-contract container, not a second implementation of OpenAPI validation. */
export const apiBindingPlanningOperationSchema = z.object({
  key: apiOperationKeySchema,
  openapiVersion: planningEvidenceTextSchema,
  source: z.literal('paths'),
  method: planningEvidenceTextSchema,
  path: z.string(),
  operation: z.record(z.string(), z.unknown()),
  pathItem: z.record(z.string(), z.unknown()),
  effective: z.object({
    parameters: z.array(z.custom<ApiParameterObject>()),
    security: z.array(z.record(z.string(), z.array(z.string()))),
    securitySchemes: z.record(z.string(), z.unknown()),
    servers: z.array(z.custom<ApiServerObject>()).optional(),
  }),
});

export const apiBindingMaterialRoleSchema = z.strictObject({
  purpose: planningEvidenceTextSchema.optional(),
  requestMediaType: planningEvidenceTextSchema.optional(),
});

export const apiBindingCallReasonsSchema = z.array(
  z.strictObject({
    callId: planningEvidenceTextSchema,
    reason: planningEvidenceTextSchema.optional(),
  }),
);

/** Nested OAS and native data are compared to a newly derived exact source snapshot. */
export const apiBindingPlanningContextSchema = z.strictObject({
  literalSourceMessages: workflowNonemptySourceMessagesSchema.optional(),
  scenario: planningEvidenceTextSchema,
  materials: z.array(z.custom<ApiBindingPlanningMaterial>()),
  nativeOutputs: z.array(z.custom<NativeOutputContract>()).optional(),
}) satisfies z.ZodType<ApiBindingPlanningContext>;

export const apiBindingPlanningRecordSchema = z.strictObject({
  kind: z.literal('proposed-bindings'),
  calls: z.array(
    z.strictObject({
      callId: planningEvidenceTextSchema,
      bindings: z.array(
        z.strictObject({
          kind: z.literal('node-output'),
          targetPointer: z.string().min(1),
          sourceNodeId: planningEvidenceTextSchema,
          sourcePointer: z.string(),
        }),
      ),
      reason: planningEvidenceTextSchema.optional(),
    }),
  ),
  gaps: z.array(
    z.strictObject({
      callId: planningEvidenceTextSchema,
      targetPointer: z.string().min(1),
      description: planningEvidenceTextSchema,
    }),
  ),
  evidence: z.strictObject({
    kind: z.literal('supplied-binding-contracts'),
    context: apiBindingPlanningContextSchema,
  }),
}) satisfies z.ZodType<ApiBindingPlanningRecord>;
