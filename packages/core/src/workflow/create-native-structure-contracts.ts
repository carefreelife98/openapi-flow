import type {
  WorkflowNodeContractsInput,
  WorkflowPlanNodeContract,
} from '../types/workflow-plan.js';
import { createWorkflowNodeContracts } from './create-workflow-node-contracts.js';
import { inspectNativeReferenceStructure } from './inspect-native-reference-structure.js';

/** Edit discovery reads explicit structure, not a not-yet-repaired source schema. Never final graph validation. */
export function createNativeStructureContracts(
  input: WorkflowNodeContractsInput,
): WorkflowPlanNodeContract[] {
  const contracts = createWorkflowNodeContracts({ ...input, nativeNodes: [] });
  for (const node of input.nativeNodes) {
    const capability = input.capabilities.find(
      (capability) => capability.name === node.capability,
    );
    if (!capability)
      throw new Error(
        `Native structure node ${node.id}: unknown capability ${node.capability}`,
      );
    if (!capability.referenceStructureSchema) {
      contracts.push(
        ...createWorkflowNodeContracts({
          materials: [],
          nativeNodes: [node],
          capabilities: [capability],
        }),
      );
      continue;
    }
    const bindings = inspectNativeReferenceStructure({ node, capability });
    const controls = bindings.filter(
      (binding) => binding.reference.source === 'exclusive-output',
    );
    if (controls.length > 1)
      throw new Error(
        `Native ${node.id} declares multiple exclusive rejoin producers`,
      );
    contracts.push({
      id: node.id,
      inputs: capability.inputPorts(node.parameters),
      outputs: capability.outputPorts(node.parameters),
      references: bindings.flatMap((binding) =>
        binding.reference.source === 'exclusive-output'
          ? []
          : [binding.reference],
      ),
      dependencyNodeIds: [],
      waitsForAllInputs: capability.waitsForAllInputs,
      exclusiveOutputPorts: capability.exclusiveOutputPorts,
      ...(controls.length
        ? { rejoinsExclusiveOutputs: controls[0].reference.nodeId }
        : {}),
    });
  }
  return contracts;
}
