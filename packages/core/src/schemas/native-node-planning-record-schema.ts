import { z } from 'zod';
import type {
  NativeNodePlanningContext,
  NativeNodePlanningRecord,
  NativePlanningAssessment,
  NativePlanningResult,
  NativePlanningVerification,
} from '../types/native-node-planning.js';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';
import { workflowDraftNativeNodeSchema } from './workflow-draft-schema.js';

export const nativeNodePlanningOptionsSchema = z.strictObject({
  planId: planningEvidenceTextSchema,
  scenario: planningEvidenceTextSchema,
  allowRuntimeParameters: z.boolean().optional(),
});

export const nativePlanningProposalSchema = z.strictObject({
  nativeNodes: z.array(workflowDraftNativeNodeSchema),
  gaps: z.array(z.strictObject({ description: planningEvidenceTextSchema })),
});

export const nativePlanningResultSchema = z.strictObject({
  nativeNodes: z.array(workflowDraftNativeNodeSchema),
  gaps: z.array(
    z.strictObject({
      id: planningEvidenceTextSchema,
      stage: z.literal('workflow-graph'),
      description: planningEvidenceTextSchema,
    }),
  ),
}) satisfies z.ZodType<NativePlanningResult>;

export const nativePlanningAssessmentSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('additions'),
    nodes: z
      .array(
        z.strictObject({
          nodeId: planningEvidenceTextSchema,
          reason: planningEvidenceTextSchema,
        }),
      )
      .min(1),
  }),
  z.strictObject({
    kind: z.literal('no-additions'),
    reason: planningEvidenceTextSchema,
  }),
]) satisfies z.ZodType<NativePlanningAssessment>;

const recordFields = {
  planId: planningEvidenceTextSchema,
  plan: nativePlanningResultSchema,
  evidence: z.strictObject({
    kind: z.literal('native-planning-context'),
    context: z.custom<NativeNodePlanningContext>(),
  }),
  verification: z.custom<NativePlanningVerification>(),
};

/** Source data and derived receipts are checked by exact reconstruction, not accepted on trust. */
export const nativeNodePlanningRecordSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...recordFields, kind: z.literal('no-capabilities') }),
  z.strictObject({
    ...recordFields,
    kind: z.literal('model-plan'),
    assessment: nativePlanningAssessmentSchema,
  }),
]) satisfies z.ZodType<NativeNodePlanningRecord>;
