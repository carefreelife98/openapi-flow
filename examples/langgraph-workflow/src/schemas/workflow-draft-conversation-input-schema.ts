import { z } from 'zod';
import type { WorkflowDraft } from '@openapi-flow/core';
import type { WorkflowDraftConversationInput } from '../types/workflow-draft-conversation.js';

export const draftConversationMessageSchema = z.strictObject({
  id: z.string().refine((value) => value.trim().length > 0),
  text: z.string().refine((value) => value.trim().length > 0),
});
export const draftConversationTurnInputSchema: z.ZodType<WorkflowDraftConversationInput> =
  z.strictObject({
    request: draftConversationMessageSchema.extend({
      expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    }),
    // Core performs the full original-OAS, topology, revision and provenance checks.
    initialDraft: z.custom<WorkflowDraft>().optional(),
  });
