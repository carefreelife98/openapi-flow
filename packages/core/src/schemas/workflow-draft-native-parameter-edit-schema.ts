import { z } from 'zod';
import type {
  WorkflowDraftNativeParameterEditDescription,
  WorkflowDraftNativeParameterEditProposal,
  WorkflowDraftNativeParameterEditContract,
} from '../types/workflow-draft-native-parameter-edit.js';
import { workflowMessageEvidenceSchema } from './planning-evidence-schema.js';
import { createWorkflowDraftEditMessageFields } from './workflow-draft-edit-message-fields.js';
import type { WorkflowMessageEvidence } from '../types/planning-evidence.js';

export function createWorkflowDraftNativeParameterEditProposalSchema(
  context: WorkflowDraftNativeParameterEditDescription,
  messageSchema?: z.ZodType<WorkflowMessageEvidence>,
): z.ZodType<WorkflowDraftNativeParameterEditProposal> {
  const evidence = createWorkflowDraftEditMessageFields(
    context.messages.map((message) => message.id),
    context.includeExplanations,
    messageSchema,
  );
  const fields = {
    sources: z.array(evidence.message).min(1),
    ...evidence.fields,
  };
  const allowsDeferral =
    context.allowRuntimeParameters &&
    context.capability.supportsRuntimeParameters;
  const choices: z.ZodType[] = [
    z.strictObject({
      status: z.literal('targets'),
      targets: z
        .array(
          z.strictObject({
            kind: allowsDeferral
              ? z.enum(['set', 'remove', 'defer'])
              : z.enum(['set', 'remove']),
            pointer: z
              .string()
              .describe(
                'Exact RFC 6901 parameter pointer. Empty means explicit whole-object set. Defer means only this explicitly requested field is supplied at execution; keep unrelated literals and owners. No node, port or schema metadata.',
              ),
            ...fields,
          }),
        )
        .min(1),
    }),
    z.strictObject({
      status: z.literal('needs-clarification'),
      message: z.string().min(1),
      ...fields,
    }),
  ];
  if (allowsDeferral)
    choices.push(
      z.strictObject({ status: z.literal('runtime-parameters'), ...fields }),
    );
  return z.strictObject({
    decision: z.union(choices),
  }) as z.ZodType<WorkflowDraftNativeParameterEditProposal>;
}

const resource = z.union([z.boolean(), z.record(z.string(), z.unknown())]);
const evidence = {
  sources: z.array(workflowMessageEvidenceSchema).min(1),
  explanation: z
    .strictObject({
      reason: z.string().min(1),
      evidence: z.array(workflowMessageEvidenceSchema).min(1),
    })
    .optional(),
};
export const workflowDraftNativeParameterEditContractSchema = z.strictObject({
  id: z.string().min(1),
  fingerprint: z.string().min(1),
  stepId: z.string().min(1),
  nodeId: z.string().min(1),
  schemaResource: resource,
  targets: z
    .array(
      z.union([
        z.strictObject({
          id: z.string().min(1),
          kind: z.literal('set'),
          pointer: z.string(),
          schema: resource,
          ...evidence,
        }),
        z.strictObject({
          id: z.string().min(1),
          kind: z.enum(['remove', 'defer']),
          pointer: z.string(),
          ...evidence,
        }),
      ]),
    )
    .min(1),
}) satisfies z.ZodType<WorkflowDraftNativeParameterEditContract>;
