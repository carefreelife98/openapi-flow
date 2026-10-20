import type {
  WorkflowNodeContractsInput,
  WorkflowPlanNodeContract,
} from '../types/workflow-plan.js';
import { resolveNativeStructureParameters } from './resolve-native-structure-parameters.js';
import { requireNativeParameterReferenceSources } from './planning/select-native-parameter-producers.js';
import { createUnresolvedNodeContracts } from './create-unresolved-node-contracts.js';

export function createWorkflowNodeContracts({
  materials,
  nativeNodes,
  capabilities,
  unresolvedNodes,
}: WorkflowNodeContractsInput): WorkflowPlanNodeContract[] {
  const registry = new Map(capabilities.map((item) => [item.name, item]));
  if (registry.size !== capabilities.length)
    throw new Error('capabilities contains duplicate names');
  const contracts: WorkflowPlanNodeContract[] = materials.map((item) => ({
    id: item.arguments.callId,
    inputs: ['main'],
    outputs: ['main'],
    references: item.arguments.bindings.map((binding) => ({
      source: materials.some(
        (source) => source.arguments.callId === binding.sourceNodeId,
      )
        ? 'response'
        : 'node-output',
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
    const parameters = resolveNativeStructureParameters(native, capability);
    const contract: WorkflowPlanNodeContract = {
      id: native.id,
      inputs: capability.inputPorts(parameters),
      outputs: capability.outputPorts(parameters),
      references: [
        ...capability.responseReferences(parameters),
        ...(capability.nodeOutputReferences
          ? capability.nodeOutputReferences(parameters)
          : []),
      ],
      ...(capability.inputReferences
        ? { inputReferences: capability.inputReferences(parameters) }
        : {}),
      dependencyNodeIds: [],
      waitsForAllInputs: capability.waitsForAllInputs,
      exclusiveOutputPorts: capability.exclusiveOutputPorts,
      ...(capability.rejoinsExclusiveOutputs
        ? {
            rejoinsExclusiveOutputs:
              capability.rejoinsExclusiveOutputs(parameters),
          }
        : {}),
    };
    if (capability.parameterReferenceSources !== undefined) {
      const supported = requireNativeParameterReferenceSources(capability);
      const actual = [
        ...contract.references,
        ...Object.values(
          contract.inputReferences === undefined
            ? {}
            : contract.inputReferences,
        ).flat(),
      ];
      if (
        actual.some((reference) => !supported.includes(reference.source)) ||
        (contract.rejoinsExclusiveOutputs !== undefined &&
          !supported.includes('exclusive-output'))
      )
        throw new Error(
          `Native capability ${capability.name}.parameterReferenceSources contradicts actual references for node ${native.id}`,
        );
    }
    contracts.push(contract);
  }
  if (unresolvedNodes !== undefined)
    contracts.push(...createUnresolvedNodeContracts(unresolvedNodes));
  return contracts;
}
