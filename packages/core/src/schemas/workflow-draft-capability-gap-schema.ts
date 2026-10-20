import { z } from 'zod';
import type {
  WorkflowDraftCapabilityGapFinding,
  WorkflowDraftCapabilityGap,
} from '../types/workflow-draft-capability-gap.js';
import { apiOperationKeySchema } from './api-operation-key-schema.js';
import { workflowMessageEvidenceSchema } from './planning-evidence-schema.js';

const text = z.string().refine((value) => value.trim().length > 0);
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);

export function createWorkflowDraftCapabilityGapFindingSchema<Operation>(
  operationSchema?: z.ZodType<Operation>,
): z.ZodType<WorkflowDraftCapabilityGapFinding<Operation>> {
  const reason = text.describe(
    'Concise user-facing reason in the user language. State the limitation of supplied OAS/native contracts, not a universal absence claim. Never invent a contract, endpoint, value or private chain-of-thought.',
  );
  return z.union([
    z.strictObject({ kind: z.literal('missing-api'), reason }),
    z.strictObject({ kind: z.literal('unsupported-native'), reason }),
    ...(operationSchema === undefined
      ? []
      : [
          z.strictObject({
            kind: z.literal('api-contract-gap'),
            operation: operationSchema,
            reason,
          }),
        ]),
  ]) as z.ZodType<WorkflowDraftCapabilityGapFinding<Operation>>;
}

export const workflowDraftGapInventorySchema = z.strictObject({
  operations: z
    .array(apiOperationKeySchema)
    .refine(
      (keys) =>
        new Set(keys.map((key) => JSON.stringify(key))).size === keys.length,
    ),
  capabilities: z
    .array(z.strictObject({ name: text, fingerprint }))
    .refine(
      (entries) =>
        new Set(entries.map((entry) => entry.name)).size === entries.length,
    ),
});
export const workflowDraftCapabilityGapFieldsSchema = z.strictObject({
  id: text,
  requestedBehavior: text,
  finding: createWorkflowDraftCapabilityGapFindingSchema(apiOperationKeySchema),
  sources: z
    .array(workflowMessageEvidenceSchema)
    .min(1)
    .refine(
      (sources) =>
        new Set(sources.map((source) => source.messageId)).size ===
        sources.length,
    ),
  inventory: workflowDraftGapInventorySchema,
});
export const workflowDraftCapabilityGapSchema: z.ZodType<WorkflowDraftCapabilityGap> =
  workflowDraftCapabilityGapFieldsSchema.extend({ fingerprint });
