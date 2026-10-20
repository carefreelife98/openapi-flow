import { isDeepStrictEqual } from 'node:util';
import type {
  WorkflowCapability,
  WorkflowValueReference,
} from '../types/workflow-plan.js';
import type { WorkflowNativeMaterialSources } from '../types/native-material-snapshot.js';

/** Captured contracts must describe the actual referenced producer, not another material revision. */
export function validateNativeMaterialSources(
  capability: WorkflowCapability,
  references: WorkflowValueReference[],
  sources: WorkflowNativeMaterialSources,
): void {
  if (capability.bindMaterialContracts && !capability.materialSources)
    throw new Error(
      `Native capability ${capability.name}.bindMaterialContracts must declare its actual materialSources`,
    );
  if (!capability.materialSources) return;
  for (const reference of references) {
    if (reference.source === 'response') {
      const actual = sources.apiMaterials.find(
        (source) => source.callId === reference.nodeId,
      );
      const captured = capability.materialSources.apiMaterials.find(
        (source) => source.callId === reference.nodeId,
      );
      if (
        !actual ||
        !captured ||
        !isDeepStrictEqual(actual.operation, captured.operation)
      )
        throw new Error(
          `Native capability ${capability.name}: API source ${reference.nodeId} does not match the current material contract`,
        );
    } else {
      const actual = sources.nativeOutputs.find(
        (source) => source.nodeId === reference.nodeId,
      );
      const captured = capability.materialSources.nativeOutputs.find(
        (source) => source.nodeId === reference.nodeId,
      );
      if (
        !actual ||
        !captured ||
        !isDeepStrictEqual(actual.schema, captured.schema)
      )
        throw new Error(
          `Native capability ${capability.name}: native source ${reference.nodeId} does not match the current material contract`,
        );
    }
  }
}
