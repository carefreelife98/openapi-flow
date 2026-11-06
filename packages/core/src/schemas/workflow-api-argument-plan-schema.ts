import { z } from 'zod';
import type { WorkflowApiArgumentPlan } from '../types/workflow-api-arguments.js';

export const workflowInputSelectionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('json'), sourceId: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('text'),
    sourceId: z.string().min(1),
    startTokenId: z.string().min(1),
    endTokenId: z.string().min(1),
  }),
]);

export const workflowApiArgumentPlanSchema = z.strictObject({
  sourceFingerprint: z.string().min(1),
  calls: z.record(
    z.string().min(1),
    z.strictObject({
      assignments: z.array(
        z.strictObject({
          targetId: z.string().min(1),
          targetSelections: z.record(
            z.string(),
            z.union([z.string(), z.number().int(), z.array(z.string())]),
          ),
          source: workflowInputSelectionSchema,
        }),
      ),
      requestedInputs: z.array(z.string()),
      reason: z.string().optional(),
    }),
  ),
}) satisfies z.ZodType<WorkflowApiArgumentPlan>;
