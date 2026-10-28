import type {
  WorkflowConnectionGoalProposal,
  WorkflowConnectionStepDescription,
} from '../../../types/workflow-connection-session.js';
import type { WorkflowConnectionOutlineProposal } from '../../../types/workflow-connection-outline.js';
import type { WorkflowConnectionOutlineGoalAssociation } from '../../../types/workflow-connection-outline-goals.js';

function goalAnchors(decision: WorkflowConnectionGoalProposal): string[] {
  switch (decision.kind) {
    case 'precedence':
      return [decision.before, decision.after];
    case 'route':
      return [decision.from, decision.to];
    case 'join':
      return [decision.nodeId, ...decision.producerIds];
    case 'independent':
      return decision.nodeIds;
    case 'semantic':
      return [];
  }
}

/** Uses validated typed goals and supplied material identities, never prose or model ID coverage. */
export function deriveWorkflowConnectionOutlineGoals(
  step: WorkflowConnectionStepDescription,
  proposal: WorkflowConnectionOutlineProposal,
): WorkflowConnectionOutlineGoalAssociation {
  const bundles = proposal.bundles.map((bundle) => new Set(bundle.nodeIds));
  const association: WorkflowConnectionOutlineGoalAssociation = {
    bundleGoalIds: bundles.map(() => []),
    globalGoalIds: [],
  };
  for (const goal of step.goals) {
    const anchors = goalAnchors(goal.decision);
    for (const [index, bundle] of bundles.entries()) {
      if (anchors.some((id) => bundle.has(id)))
        association.bundleGoalIds[index]!.push(goal.id);
    }
    if (
      !anchors.length ||
      !bundles.some((bundle) => anchors.every((id) => bundle.has(id)))
    )
      association.globalGoalIds.push(goal.id);
  }
  return association;
}
