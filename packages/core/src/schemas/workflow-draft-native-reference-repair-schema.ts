import { z } from 'zod';
import type {
  WorkflowDraftNativeReferenceRepairDescription,
  WorkflowDraftNativeReferenceRepairProposal,
} from '../types/workflow-draft-native-reference-repair.js';
import { createWorkflowDraftSourceEvidenceFields } from './create-workflow-draft-source-evidence-fields.js';

/** Fixed object keys, actual source choices, no parameter values or host-owned patch metadata. */
export function createWorkflowDraftNativeReferenceRepairSchema(
  context: WorkflowDraftNativeReferenceRepairDescription,
): z.ZodType<WorkflowDraftNativeReferenceRepairProposal> {
  const fields = createWorkflowDraftSourceEvidenceFields(context);
  if (
    !context.bindings.length ||
    new Set(context.bindings.map((binding) => binding.id)).size !==
      context.bindings.length
  )
    throw new Error(
      'Native reference repair schema requires distinct actual binding locations',
    );
  return z.strictObject({
    decisions: z.strictObject(
      Object.fromEntries(
        context.bindings.map((binding) => {
          const sourceIds =
            binding.reference.source === 'exclusive-output'
              ? context.sources.exclusiveOutputs.map((source) => source.nodeId)
              : context.sources.values
                  .filter(
                    (source) =>
                      source.kind ===
                      (binding.reference.source === 'response'
                        ? 'api'
                        : 'native'),
                  )
                  .map((source) => source.nodeId);
          const choices: z.ZodType[] = [
            z.strictObject({ kind: z.literal('keep'), ...fields }),
            z.strictObject({
              kind: z.literal('needs-clarification'),
              message: z
                .string()
                .min(1)
                .describe(
                  'Ask about the missing source/reference. Do not invent a producer, literal, conversion or altered condition.',
                ),
              ...fields,
            }),
          ];
          if (sourceIds.length)
            choices.push(
              z.strictObject({
                kind: z.literal('bind'),
                sourceNodeId: z.enum(sourceIds),
                ...(binding.valuePointer === undefined
                  ? {}
                  : {
                      sourcePointer: z
                        .string()
                        .describe(
                          'Exact RFC 6901 API response-body/native-output pointer declared by the selected source; empty means the whole value. No transformations or guessed envelopes.',
                        ),
                    }),
                ...fields,
              }),
            );
          return [binding.id, z.union(choices)];
        }),
      ),
    ),
  }) as z.ZodType<WorkflowDraftNativeReferenceRepairProposal>;
}
