import { z } from 'zod';
import { workflowMessageEvidenceSchema } from './planning-evidence-schema.js';
import type { WorkflowDraftApiInputEditContract } from '../types/workflow-draft-api-input-edit.js';

const schemaResource = z.union([
  z.boolean(),
  z.record(z.string(), z.unknown()),
]);
const fields = {
  id: z.string().min(1),
  pointer: z.string().min(1),
  sources: z.array(workflowMessageEvidenceSchema).min(1),
  explanation: z
    .strictObject({
      reason: z.string().min(1),
      evidence: z.array(workflowMessageEvidenceSchema).min(1),
    })
    .optional(),
};

/** Shape only; original context re-derivation remains the schema authority. */
export const workflowDraftApiInputEditContractSchema = z.strictObject({
  id: z.string().min(1),
  planId: z.string().min(1),
  stepId: z.string().min(1),
  nodeId: z.string().min(1),
  requestMediaType: z.string().min(1).optional(),
  schemaResource,
  targets: z
    .array(
      z.discriminatedUnion('kind', [
        z.strictObject({
          ...fields,
          kind: z.literal('set'),
          schema: schemaResource,
        }),
        z.strictObject({ ...fields, kind: z.literal('remove') }),
      ]),
    )
    .min(1),
}) satisfies z.ZodType<WorkflowDraftApiInputEditContract>;
