import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type {
  ResolveWorkflowIntentInput,
  ValidateWorkflowIntentInput,
  WorkflowIntentPlan,
} from '../../types/workflow-intent.js';
import {
  createWorkflowIntentProposalSchema,
  workflowIntentInputSchema,
} from '../../schemas/workflow-intent-schema.js';

/** Structural validation only: business interpretation remains a model/human decision. */
export function resolveWorkflowIntent(
  input: ResolveWorkflowIntentInput,
): WorkflowIntentPlan {
  const source = workflowIntentInputSchema.parse({
    scenario: input.scenario,
    messages: input.messages,
  });
  const proposal = createWorkflowIntentProposalSchema(source).parse(
    input.proposal,
  );
  for (const flow of proposal.flows) {
    for (const index of flow.roleIndices) {
      const role = proposal.roles[index];
      if (role === undefined)
        throw new Error(
          `Workflow intent flow references absent role index ${index}`,
        );
      if (role.scope !== 'required')
        throw new Error(
          'Active workflow intent flows must not activate conditional or excluded roles',
        );
    }
  }
  const digest = createHash('sha256')
    .update(JSON.stringify({ source, proposal }))
    .digest('hex');
  const roles = proposal.roles.map(({ sourceMessageIds, ...role }, index) => ({
    ...role,
    id: `intent:${digest}:role:${index + 1}`,
    sources: sourceMessageIds.map((id) =>
      structuredClone(source.messages.find((message) => message.id === id)!),
    ),
  }));
  return structuredClone({
    id: `intent:${digest}`,
    source,
    objective: proposal.objective,
    roles,
    flows: proposal.flows.map(({ roleIndices, ...flow }) => ({
      ...flow,
      roleIds: roleIndices.map((index) => roles[index]!.id),
    })),
  });
}

export function validateWorkflowIntent(
  input: ValidateWorkflowIntentInput,
): WorkflowIntentPlan {
  const plan = input.plan;
  const expected = resolveWorkflowIntent({
    scenario: input.scenario,
    messages: input.messages,
    proposal: {
      objective: plan.objective,
      roles: plan.roles.map(({ sources, task, scope }) => ({
        task,
        scope,
        sourceMessageIds: sources.map((source) => source.id),
      })),
      flows: plan.flows.map(({ roleIds, ...flow }) => ({
        ...flow,
        roleIndices: roleIds.map((id) =>
          plan.roles.findIndex((role) => role.id === id),
        ),
      })),
    },
  });
  if (!isDeepStrictEqual(expected, plan))
    throw new Error(
      'Workflow intent differs from its original business scope or source messages',
    );
  return expected;
}
