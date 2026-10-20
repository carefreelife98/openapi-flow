import { z } from 'zod';
import type { WorkflowSourceMessage } from '@openapi-flow/core';

/** Resolve only an explicitly selected current source ID, from a captured immutable snapshot. */
export function createWorkflowMessageEvidenceSelectionSchema(
  supplied: WorkflowSourceMessage[],
) {
  const messages = z
    .array(z.strictObject({ id: z.string().min(1), text: z.string().min(1) }))
    .min(1)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
    )
    .parse(supplied);
  return z
    .strictObject({
      kind: z.literal('message'),
      messageId: z
        .enum(messages.map((message) => message.id))
        .describe(
          'Select a supplied message ID only. Code attaches its unchanged original text; never generate a quote.',
        ),
    })
    .transform((selection) => {
      const message = messages.find((item) => item.id === selection.messageId);
      if (!message)
        throw new Error(
          `Message evidence selection references unavailable source ${selection.messageId}`,
        );
      return { ...selection, quote: message.text };
    });
}
