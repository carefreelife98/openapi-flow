import { resolveNativeStructureParameters } from '../resolve-native-structure-parameters.js';
import type {
  PlannedNativeNode,
  WorkflowCapability,
} from '../../types/workflow-plan.js';
import type { PreparedNativeNodeMaterial } from '../../types/native-node-planning.js';

/** Expose existing implementation-owned ports, not descriptions for the model to guess. */
export function createPreparedNativeNodeMaterials(
  nodes: PlannedNativeNode[],
  capabilities: WorkflowCapability[],
): PreparedNativeNodeMaterial[] {
  return nodes.map((planned) => {
    const capability = capabilities.find(
      (item) => item.name === planned.capability,
    );
    if (!capability)
      throw new Error(
        `prepared node ${planned.id}: unknown capability ${planned.capability}`,
      );
    const parameters = resolveNativeStructureParameters(planned, capability);
    return {
      ...planned,
      inputPorts: capability.inputPorts(parameters),
      outputPorts: capability.outputPorts(parameters),
    };
  });
}
