import type { WorkflowUnresolvedNode } from '../types/workflow-draft-capability-gap.js';
import type { WorkflowPlanNodeContract } from '../types/workflow-plan.js';

/** Structural ports do not advertise a usable response/value contract. */
export function createUnresolvedNodeContracts(
  nodes: WorkflowUnresolvedNode[],
): WorkflowPlanNodeContract[] {
  return nodes.map((node) => ({
    id: node.id,
    inputs: ['main'],
    outputs: ['main'],
    references: [],
    dependencyNodeIds: [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
  }));
}
