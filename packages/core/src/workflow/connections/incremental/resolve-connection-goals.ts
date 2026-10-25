import type {
  WorkflowConnectionGoalProposal,
  WorkflowConnectionSession,
  WorkflowConnectionSessionSource,
} from '../../../types/workflow-connection-session.js';
import type { WorkflowPlanNodeContract } from '../../../types/workflow-plan.js';
import { workflowConnectionGoalProposalSchema } from '../../../schemas/workflow-connection-session-schema.js';
import { connectionValueFingerprint } from './connection-graph-identity.js';

export function resolveConnectionGoals(
  input: WorkflowConnectionSessionSource,
  contracts: WorkflowPlanNodeContract[],
  proposals: WorkflowConnectionGoalProposal[],
): WorkflowConnectionSession['goals'] {
  if (!Array.isArray(proposals) || !proposals.length)
    throw new Error('Connection goals must cover the supplied requirements');
  const facts = new Set(input.requirements.map((item) => item.id));
  const covered = new Set<string>();
  const nodes = new Map(contracts.map((node) => [node.id, node]));
  const goals = proposals.map((value) => {
    const decision = workflowConnectionGoalProposalSchema.parse(value);
    if (
      new Set(decision.factIds).size !== decision.factIds.length ||
      decision.factIds.some((id) => !facts.has(id))
    )
      throw new Error(
        'Connection goal references unknown or duplicate requirements',
      );
    decision.factIds.forEach((id) => covered.add(id));
    const ids =
      decision.kind === 'semantic'
        ? []
        : decision.kind === 'precedence'
          ? [decision.before, decision.after]
          : decision.kind === 'route'
            ? [decision.from, decision.to]
            : decision.kind === 'join'
              ? [decision.nodeId, ...decision.producerIds]
              : decision.nodeIds;
    if (new Set(ids).size !== ids.length || ids.some((id) => !nodes.has(id)))
      throw new Error(
        'Connection goal references unknown, repeated or self nodes',
      );
    if (
      decision.kind === 'route' &&
      !nodes.get(decision.from)!.outputs.includes(decision.output)
    )
      throw new Error('Connection goal references an unknown output port');
    if (
      decision.kind === 'join' &&
      !nodes.get(decision.nodeId)!.waitsForAllInputs
    )
      throw new Error(
        'Connection join goal requires a registered all-input join',
      );
    return { id: `goal-${connectionValueFingerprint(decision)}`, decision };
  });
  if ([...facts].some((id) => !covered.has(id)))
    throw new Error('Connection goals omit a confirmed requirement');
  if (new Set(goals.map((goal) => goal.id)).size !== goals.length)
    throw new Error('Duplicate connection goals');
  return goals;
}
