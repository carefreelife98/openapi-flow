import type { ValidateReviewableWorkflowGraphPlanInput } from '../types/reviewable-workflow.js';
import type { WorkflowPlanNodeContract } from '../types/workflow-plan.js';
import { createWorkflowNodeContracts } from './create-workflow-node-contracts.js';

export function createReviewableNodeContracts({
  plan,
  materials,
  capabilities,
}: ValidateReviewableWorkflowGraphPlanInput): WorkflowPlanNodeContract[] {
  const blocked = new Set(plan.blockedCalls.map((item) => item.callId));
  const ready = materials.filter((item) => item.status === 'ready');
  const contracts = createWorkflowNodeContracts({
    materials: ready,
    nativeNodes: plan.nativeNodes,
    capabilities,
  });
  for (const contract of contracts)
    if (blocked.has(contract.id)) {
      contract.dependencyNodeIds = contract.references.map(
        (reference) => reference.nodeId,
      );
      contract.references = [];
    }
  for (const material of materials.filter((item) => item.status === 'blocked'))
    contracts.push({
      id: material.callId,
      inputs: ['main'],
      outputs: ['main'],
      references: [],
      dependencyNodeIds: material.bindings.map(
        (binding) => binding.sourceNodeId,
      ),
      waitsForAllInputs: false,
      exclusiveOutputPorts: false,
    });
  for (const gap of plan.gaps)
    contracts.push({
      id: gap.id,
      inputs: ['main'],
      outputs: ['main'],
      references: [],
      dependencyNodeIds: [],
      waitsForAllInputs: false,
      exclusiveOutputPorts: false,
    });
  return contracts;
}
