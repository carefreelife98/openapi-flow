import { z } from 'zod';
import { apiOperationKeySchema } from './api-operation-key-schema.js';
import type {
  WorkflowMessageEvidence,
  WorkflowPlanningEvidence,
  WorkflowEntryPointContract,
} from '../types/planning-evidence.js';
import type { WorkflowSourceMessage } from '../types/workflow-draft.js';

/** Independently annotated fields share validation, not an inherited metadata/reference identity. */
export function createPlanningEvidenceTextSchema() {
  return z.string().refine((value) => value.trim().length > 0);
}
export const planningEvidenceTextSchema = createPlanningEvidenceTextSchema();
export const workflowSourceMessagesSchema = z
  .array(
    z.strictObject({
      id: planningEvidenceTextSchema,
      text: z.string(),
    }),
  )
  .refine(
    (messages) =>
      new Set(messages.map((message) => message.id)).size === messages.length,
  ) satisfies z.ZodType<WorkflowSourceMessage[]>;
export const workflowPlanningMessagesSchema = z
  .array(
    z.strictObject({
      id: planningEvidenceTextSchema,
      text: planningEvidenceTextSchema,
    }),
  )
  .min(1)
  .refine(
    (messages) =>
      new Set(messages.map((message) => message.id)).size === messages.length,
  ) satisfies z.ZodType<WorkflowSourceMessage[]>;
export const workflowMessageEvidenceSchema = z.strictObject({
  kind: z.literal('message'),
  messageId: planningEvidenceTextSchema,
  quote: planningEvidenceTextSchema,
}) satisfies z.ZodType<WorkflowMessageEvidence>;
export const workflowEntryPointContractSchema = z.strictObject({
  kind: planningEvidenceTextSchema,
  description: planningEvidenceTextSchema,
}) satisfies z.ZodType<WorkflowEntryPointContract>;
export const workflowPlanningEvidenceSchema = z.discriminatedUnion('kind', [
  workflowMessageEvidenceSchema,
  z.strictObject({
    kind: z.literal('oas'),
    operation: apiOperationKeySchema,
    pointer: z.string(),
  }),
  z.strictObject({
    kind: z.literal('native'),
    capability: planningEvidenceTextSchema,
  }),
  z.strictObject({
    kind: z.literal('entrypoint'),
    entrypoint: planningEvidenceTextSchema,
  }),
]) satisfies z.ZodType<WorkflowPlanningEvidence>;
