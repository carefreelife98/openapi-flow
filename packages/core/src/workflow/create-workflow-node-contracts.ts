import type {
  WorkflowNodeContractsInput,
  WorkflowPlanNodeContract,
} from '../types/workflow-plan.js';

export function createWorkflowNodeContracts({
  materials,
  nativeNodes,
  capabilities,
}: WorkflowNodeContractsInput): WorkflowPlanNodeContract[] {
  const registry = new Map(capabilities.map((item) => [item.name, item]));
  if (registry.size !== capabilities.length)
    throw new Error('capabilities contains duplicate names');
  const contracts: WorkflowPlanNodeContract[] = materials.map((item) => ({
    id: item.arguments.callId,
    inputs: ['main'],
    outputs: ['main'],
    references: item.arguments.bindings.map((binding) => ({
      source: 'response',
      nodeId: binding.sourceNodeId,
      pointer: binding.sourcePointer,
    })),
    dependencyNodeIds: [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
  }));
  for (const native of nativeNodes) {
    const capability = registry.get(native.capability);
    if (!capability)
      throw new Error(
        `node ${native.id}: unknown capability ${native.capability}`,
      );
    const parameters = capability.parametersSchema.parse(native.parameters);
    contracts.push({
      id: native.id,
      inputs: capability.inputPorts(parameters),
      outputs: capability.outputPorts(parameters),
      references: capability.responseReferences(parameters),
      dependencyNodeIds: [],
      waitsForAllInputs: capability.waitsForAllInputs,
      exclusiveOutputPorts: capability.exclusiveOutputPorts,
    });
  }
  return contracts;
}
