import { parseNativeNodeParameters } from '@openapi-flow/core';
import type { PlannedNativeNode, WorkflowCapability } from '@openapi-flow/core';
import type { PreparedNativeNodeMaterial } from '../types/workflow-planning.js';

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
    const parameters = parseNativeNodeParameters(planned, capability);
    return {
      ...planned,
      inputPorts: capability.inputPorts(parameters),
      outputPorts: capability.outputPorts(parameters),
    };
  });
}
