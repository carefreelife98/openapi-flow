import { z } from 'zod';
import type {
  WorkflowDraftApiBindingEditDescription,
  WorkflowDraftApiBindingEditProposal,
} from '../types/workflow-draft-api-binding-edit.js';
import { createWorkflowDraftEditMessageFields } from './workflow-draft-edit-message-fields.js';
import { workflowDraftApiBindingEditScopeSchema } from './workflow-draft-api-binding-edit-scope-schema.js';
import type { WorkflowMessageEvidence } from '../types/planning-evidence.js';

/** Only semantic ownership/source choices. Node kind, identities and patch values are code-owned. */
export function createWorkflowDraftApiBindingEditProposalSchema(
  context: WorkflowDraftApiBindingEditDescription,
  messageSchema?: z.ZodType<WorkflowMessageEvidence>,
): z.ZodType<WorkflowDraftApiBindingEditProposal> {
  if (
    !Array.isArray(context.sourceCandidates) ||
    !Array.isArray(context.messages)
  )
    throw new Error(
      'Binding edit schema requires sourceCandidates and messages arrays',
    );
  const scope = workflowDraftApiBindingEditScopeSchema.parse(context.scope);
  const sourceIds = z
    .array(z.string().refine((id) => id.trim().length > 0))
    .refine((ids) => new Set(ids).size === ids.length)
    .parse(context.sourceCandidates.map((source) => source.nodeId));
  const evidence = createWorkflowDraftEditMessageFields(
    context.messages.map((message) => message.id),
    context.includeExplanations,
    messageSchema,
  );
  const pointer =
    scope.kind === 'repair'
      ? z.enum(
          z
            .array(z.string().min(1))
            .min(1)
            .refine((items) => new Set(items).size === items.length)
            .parse(context.requiredTargetPointers),
        )
      : z.string().min(1);
  const fields = {
    targetPointer: pointer.describe(
      'Exact RFC 6901 input pointer whose ownership/source is explicitly requested to change. Never a JavaScript expression.',
    ),
    sources: z.array(evidence.message).min(1),
    ...evidence.fields,
  };
  const choices: z.ZodType[] = [
    z.strictObject({ kind: z.literal('unbind'), ...fields }),
    z.strictObject({
      kind: z.literal('needs-clarification'),
      message: z
        .string()
        .min(1)
        .describe(
          'A concrete question for the unresolved producer or mapping choice; never invent an API, transformation or value.',
        ),
      ...fields,
    }),
  ];
  if (scope.kind === 'repair')
    choices.push(z.strictObject({ kind: z.literal('keep'), ...fields }));
  if (sourceIds.length) {
    const sourceFields = {
      sourceNodeId: z.enum(sourceIds),
      sourcePointer: z
        .string()
        .describe(
          'RFC 6901 pointer into the declared API response BODY or native JSON output; empty means the whole value. Use the original contracts, not transport-envelope guesses. No computation, coercion or field-name matching.',
        ),
    };
    choices.push(
      z.strictObject({ kind: z.literal('bind'), ...fields, ...sourceFields }),
    );
    if (scope.kind === 'step')
      choices.push(
        z.strictObject({
          kind: z.literal('replace-literal-with-binding'),
          ...fields,
          ...sourceFields,
        }),
      );
  }
  return z.strictObject({
    decisions: z.array(z.union(choices)).min(1),
  }) as z.ZodType<WorkflowDraftApiBindingEditProposal>;
}
