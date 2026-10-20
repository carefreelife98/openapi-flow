import { z } from 'zod';
import type { WorkflowMessageEvidence } from '../types/planning-evidence.js';

/** Shared current-request evidence and optional display fields for edit stages. */
export function createWorkflowDraftEditMessageFields(
  messageIds: string[],
  includeExplanations: boolean,
  messageSchema?: z.ZodType<WorkflowMessageEvidence>,
) {
  z.strictObject({
    messageIds: z
      .array(z.string().refine((id) => id.trim().length > 0))
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length),
    includeExplanations: z.boolean(),
  }).parse({ messageIds, includeExplanations });
  const message =
    messageSchema ??
    z.strictObject({
      kind: z.literal('message'),
      messageId: z.enum(messageIds),
      quote: z
        .string()
        .min(1)
        .describe('Exact quotation from this current request message.'),
    });
  return {
    message,
    fields: includeExplanations
      ? {
          explanation: z.strictObject({
            reason: z
              .string()
              .min(1)
              .describe('Short user-facing reason, not chain-of-thought.'),
            evidence: z.array(message).min(1),
          }),
        }
      : {},
  };
}
