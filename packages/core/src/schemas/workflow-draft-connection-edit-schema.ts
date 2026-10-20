import { z } from 'zod';
import type {
  ReadyWorkflowDraftConnectionEditDescription,
  WorkflowDraftConnectionEditProposal,
  WorkflowDraftConnectionEditEndpoint,
} from '../types/workflow-draft-connection-edit.js';
import type { WorkflowPlanNodeContract } from '../types/workflow-plan.js';
import { createWorkflowDraftEditMessageFields } from './workflow-draft-edit-message-fields.js';
import type { WorkflowMessageEvidence } from '../types/planning-evidence.js';

function endpointSchema(
  contracts: WorkflowPlanNodeContract[],
  direction: 'inputs' | 'outputs',
): z.ZodType<WorkflowDraftConnectionEditEndpoint> | undefined {
  const choices = contracts
    .filter((contract) => contract[direction].length)
    .map((contract) =>
      z.strictObject({
        nodeId: z.literal(contract.id),
        port: z.enum(contract[direction]),
      }),
    );
  return choices.length ? z.union(choices) : undefined;
}

/** Actual endpoint/port pairs only; existing-edge IDs are computed by code. */
export function createWorkflowDraftConnectionEditProposalSchema(
  context: ReadyWorkflowDraftConnectionEditDescription,
  messageSchema?: z.ZodType<WorkflowMessageEvidence>,
): z.ZodType<WorkflowDraftConnectionEditProposal> {
  const evidence = createWorkflowDraftEditMessageFields(
    context.messages.map((message) => message.id),
    context.includeExplanations,
    messageSchema,
  );
  const fields = {
    sources: z.array(evidence.message).min(1),
    ...evidence.fields,
  };
  const choices: z.ZodType[] = [
    z.strictObject({ kind: z.literal('keep-connections'), ...fields }),
    z.strictObject({
      kind: z.literal('needs-clarification'),
      message: z
        .string()
        .min(1)
        .describe('Concrete unresolved routing question.'),
      ...fields,
    }),
  ];
  const sources = endpointSchema(context.contracts, 'outputs');
  const targets = endpointSchema(context.contracts, 'inputs');
  const affected = context.contracts.filter((contract) =>
    context.affectedNodeIds.includes(contract.id),
  );
  const affectedSources = endpointSchema(affected, 'outputs');
  const affectedTargets = endpointSchema(affected, 'inputs');
  if (affectedSources && targets)
    choices.push(
      z.strictObject({
        kind: z.literal('add'),
        source: affectedSources.describe(
          'Affected source instance and its declared output port.',
        ),
        target: targets.describe(
          'Actual target instance and its declared input port.',
        ),
        ...fields,
      }),
    );
  if (sources && affectedTargets)
    choices.push(
      z.strictObject({
        kind: z.literal('add'),
        source: sources.describe(
          'Actual source instance and its declared output port.',
        ),
        target: affectedTargets.describe(
          'Affected target instance and its declared input port.',
        ),
        ...fields,
      }),
    );
  const edgeIds = context.existingEdges
    .filter((edge) => edge.editable)
    .map((edge) => edge.id);
  if (edgeIds.length)
    choices.push(
      z.strictObject({
        kind: z.literal('remove'),
        edgeId: z
          .enum(edgeIds)
          .describe('ID of the exact existing connection to remove.'),
        ...fields,
      }),
    );
  return z.strictObject({
    decisions: z
      .array(z.union(choices))
      .min(1)
      .describe(
        'Only requested connection changes, or keep-connections alone. Do not repeat retained edges, nodes, parameters, dependencies or starts.',
      ),
  }) as z.ZodType<WorkflowDraftConnectionEditProposal>;
}
