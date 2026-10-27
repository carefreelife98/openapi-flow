import { z } from 'zod';
import type {
  WorkflowIntentInput,
  WorkflowIntentProposal,
} from '../types/workflow-intent.js';
import {
  planningEvidenceTextSchema,
  workflowPlanningMessagesSchema,
} from './planning-evidence-schema.js';

export const workflowIntentInputSchema = z.strictObject({
  scenario: planningEvidenceTextSchema,
  messages: workflowPlanningMessagesSchema,
}) satisfies z.ZodType<WorkflowIntentInput>;

/** Only semantic choices; code supplies role IDs, original source text and later execution contracts. */
export function createWorkflowIntentProposalSchema(
  input: WorkflowIntentInput,
): z.ZodType<WorkflowIntentProposal> {
  const context = workflowIntentInputSchema.parse(input);
  return z.strictObject({
    objective: planningEvidenceTextSchema.describe(
      'The current business objective, not a list of implementation details or future suggestions.',
    ),
    roles: z
      .array(
        z.strictObject({
          task: planningEvidenceTextSchema.describe(
            'A concrete business task. Do not choose API IDs, native capability names, fields, values, ports or thresholds in this overview.',
          ),
          scope: z
            .enum(['required', 'conditional', 'excluded'])
            .describe(
              'required: requested now; conditional: optional/future/only-if-later-confirmed; excluded: explicitly forbidden. A conditional possibility is never a required task.',
            ),
          sourceMessageIds: z
            .array(z.enum(context.messages.map((message) => message.id)))
            .min(1)
            .refine((ids) => new Set(ids).size === ids.length)
            .describe(
              'Select the original user message supporting this scope. Do not copy its text. This links sources, not a proof that your semantic interpretation is correct.',
            ),
        }),
      )
      .min(1),
    flows: z.array(
      z.strictObject({
        kind: z.enum(['sequence', 'parallel', 'collect']),
        roleIndices: z
          .array(z.number().int().min(0))
          .min(2)
          .refine((ids) => new Set(ids).size === ids.length)
          .describe(
            'Zero-based references into roles. Sequence is ordered; parallel is independent; collect identifies sources then the collecting role last. These are business intentions, not validated execution edges.',
          ),
        intent: planningEvidenceTextSchema.describe(
          'Requested order, independence or collection intent. Never infer it from API list order, matching field names or undocumented schemas.',
        ),
      }),
    ),
  });
}
