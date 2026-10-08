import type { PlannedNativeNode } from '@openapi-flow/core';

/** Prepared values belong to the host; model output contains only additions. */
export function assembleNativeNodeMaterials(
  prepared: PlannedNativeNode[],
  additional: PlannedNativeNode[],
): PlannedNativeNode[] {
  const preparedIds = new Set(prepared.map((node) => node.id));
  for (const node of additional)
    if (preparedIds.has(node.id))
      throw new Error(
        `additionalNativeNodes[${node.id}] duplicates preparedNativeNodes; return only new nodes, not existing materials`,
      );
  return [...prepared, ...additional];
}
