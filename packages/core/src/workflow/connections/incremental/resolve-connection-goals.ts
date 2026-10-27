import type {
  WorkflowConnectionGoalProposal,
  WorkflowConnectionSession,
  WorkflowConnectionSessionSource,
} from '../../../types/workflow-connection-session.js';
import type { WorkflowPlanNodeContract } from '../../../types/workflow-plan.js';
import { workflowConnectionGoalProposalSchema } from '../../../schemas/workflow-connection-session-schema.js';
import {
  connectionValueFingerprint,
  workflowConnectionEdgeId,
} from './connection-graph-identity.js';
import { inspectWorkflowNodeConstraints } from '../constraints/inspect-workflow-node-constraints.js';
import { WorkflowPlanningConstraintError } from '../constraints/workflow-planning-constraint-error.js';

export function resolveConnectionGoals(
  input: WorkflowConnectionSessionSource,
  contracts: WorkflowPlanNodeContract[],
  proposals: WorkflowConnectionGoalProposal[],
): WorkflowConnectionSession['goals'] {
  if (!Array.isArray(proposals) || !proposals.length)
    throw new Error('Connection goals must cover the supplied requirements');
  const facts = new Set(input.requirements.map((item) => item.id));
  const covered = new Set<string>();
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
    return { id: `goal-${connectionValueFingerprint(decision)}`, decision };
  });
  if ([...facts].some((id) => !covered.has(id)))
    throw new Error('Connection goals omit a confirmed requirement');
  if (new Set(goals.map((goal) => goal.id)).size !== goals.length)
    throw new Error('Duplicate connection goals');
  const inspection = inspectWorkflowNodeConstraints({
    contracts,
    goals: goals.map((goal) => goal.decision),
    protectedEdges: (input.edges === undefined ? [] : input.edges).filter(
      (edge) =>
        !input.editableEdgeIds?.includes(workflowConnectionEdgeId(edge)),
    ),
  });
  if (inspection.conflicts.length)
    throw new WorkflowPlanningConstraintError(inspection);
  return goals;
}
