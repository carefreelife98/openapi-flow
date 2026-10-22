import { z } from 'zod';
import type { WorkflowDraftApiInputEditProposal } from '../types/workflow-draft-api-input-edit.js';
import { createWorkflowDraftEditMessageFields } from './workflow-draft-edit-message-fields.js';
import type { WorkflowMessageEvidence } from '../types/planning-evidence.js';

/** Targets only. Literal values and all host-owned identities are absent. */
export function createWorkflowDraftApiInputEditProposalSchema(
  messageIds: string[],
  includeExplanations: boolean,
  messageSchema?: z.ZodType<WorkflowMessageEvidence>,
): z.ZodType<WorkflowDraftApiInputEditProposal> {
  const evidence = createWorkflowDraftEditMessageFields(
    messageIds,
    includeExplanations,
    messageSchema,
  );
  return z.strictObject({
    targets: z
      .array(
        z.strictObject({
          kind: z
            .enum(['set', 'remove'])
            .describe(
              'set replaces a requested field, even when its new value is unknown and must be asked later. remove requires explicit withdrawal/deletion; asking which replacement to use is not removal.',
            ),
          pointer: z
            .string()
            .min(1)
            .describe(
              'Exact RFC 6901 request-value pointer, such as /body/count or /query/name. Select only the requested fields; no whole-request reconstruction.',
            ),
          sources: z.array(evidence.message).min(1),
          ...evidence.fields,
        }),
      )
      .min(1),
  }) as z.ZodType<WorkflowDraftApiInputEditProposal>;
}
