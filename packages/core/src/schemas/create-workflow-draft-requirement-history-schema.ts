import { z } from 'zod';
import type { WorkflowDraftRequirement } from '../types/workflow-draft.js';
import type { WorkflowDraftRequirementHistoryEntry } from '../types/workflow-draft-requirement-history.js';

export function createWorkflowDraftRequirementHistorySchema(
  requirement: z.ZodType<WorkflowDraftRequirement>,
): z.ZodType<WorkflowDraftRequirementHistoryEntry> {
  const identity = z.string().refine((value) => value.trim().length > 0);
  const fields = {
    id: identity,
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    requirementId: identity,
    previousEntryId: identity.optional(),
    evidence: z
      .array(
        z.strictObject({
          kind: z.literal('message'),
          messageId: identity,
          quote: z.string(),
        }),
      )
      .min(1),
  };
  return z.discriminatedUnion('kind', [
    z.strictObject({
      ...fields,
      kind: z.literal('created'),
      after: requirement,
    }),
    z.strictObject({
      ...fields,
      kind: z.literal('restored'),
      after: requirement,
    }),
    z.strictObject({
      ...fields,
      kind: z.literal('revised'),
      before: requirement,
      after: requirement,
    }),
    z.strictObject({
      ...fields,
      kind: z.literal('removed'),
      before: requirement,
    }),
  ]);
}
