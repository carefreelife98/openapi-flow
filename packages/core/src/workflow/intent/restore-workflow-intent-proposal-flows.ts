import type {
  WorkflowIntentFlow,
  WorkflowIntentFlowProposal,
  WorkflowIntentPlan,
} from '../../types/workflow-intent.js';

/** Reconstruct original proposal order for identity checks, without activating retained relations. */
export function restoreWorkflowIntentProposalFlows(
  plan: WorkflowIntentPlan,
): WorkflowIntentFlowProposal[] {
  if (plan.inactiveFlows !== undefined && !Array.isArray(plan.inactiveFlows))
    throw new Error('Workflow intent inactiveFlows must be an array');
  const inactive = new Map(
    plan.inactiveFlows?.map((flow) => [flow.sourceIndex, flow]),
  );
  const count = plan.flows.length + inactive.size;
  if (
    plan.inactiveFlows !== undefined &&
    (inactive.size !== plan.inactiveFlows.length ||
      [...inactive.keys()].some(
        (index) => !Number.isSafeInteger(index) || index < 0 || index >= count,
      ))
  )
    throw new Error(
      'Workflow intent inactive flow positions must be distinct original indices',
    );
  const proposal = (flow: WorkflowIntentFlow): WorkflowIntentFlowProposal => ({
    kind: flow.kind,
    intent: flow.intent,
    roleIndices: flow.roleIds.map((id) =>
      plan.roles.findIndex((role) => role.id === id),
    ),
  });
  let activeIndex = 0;
  return Array.from({ length: count }, (_, index) => {
    const retained = inactive.get(index);
    if (retained !== undefined) return proposal(retained);
    const active = plan.flows[activeIndex++];
    if (active === undefined)
      throw new Error('Workflow intent is missing an original active flow');
    return proposal(active);
  });
}
