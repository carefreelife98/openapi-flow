import { z } from 'zod';
import type {
  WorkflowDraftSourceEvidenceDescription,
  WorkflowDraftSourceEvidence,
} from '../types/workflow-draft-source-evidence.js';

/** The model chooses known sources; code attaches unchanged text and original contract identities. */
export function createWorkflowDraftSourceEvidenceFields(
  context: WorkflowDraftSourceEvidenceDescription,
) {
  const metadata = z
    .strictObject({
      messageIds: z
        .array(z.string().min(1))
        .min(1)
        .refine((ids) => new Set(ids).size === ids.length),
      sourceIds: z.array(z.string().min(1)),
      includeExplanations: z.boolean(),
    })
    .parse({
      messageIds: context.messages.map((message) => message.id),
      sourceIds: [
        ...new Set(
          [...context.sources.values, ...context.sources.exclusiveOutputs].map(
            (source) => source.nodeId,
          ),
        ),
      ],
      includeExplanations: context.includeExplanations,
    });
  const sourceMessageIds = z
    .array(z.enum(metadata.messageIds))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length)
    .describe(
      'Select current request message IDs only. Code attaches their original text; do not generate quotations.',
    );
  const choices: z.ZodType<WorkflowDraftSourceEvidence>[] = [
    z.strictObject({
      kind: z.literal('message'),
      messageId: z.enum(metadata.messageIds),
    }),
  ];
  if (metadata.sourceIds.length)
    choices.push(
      z.strictObject({
        kind: z.literal('source'),
        nodeId: z
          .enum(metadata.sourceIds)
          .describe(
            'A supplied actual source contract. Code attaches its OAS identity/root or native capability; never label schema text as user speech.',
          ),
      }),
    );
  return {
    sourceMessageIds,
    ...(metadata.includeExplanations
      ? {
          explanation: z.strictObject({
            reason: z
              .string()
              .min(1)
              .describe('Concise user-facing reason, not chain-of-thought.'),
            evidence: z
              .array(z.union(choices))
              .min(1)
              .refine(
                (items) =>
                  new Set(items.map((item) => JSON.stringify(item))).size ===
                  items.length,
              ),
          }),
        }
      : {}),
  };
}
