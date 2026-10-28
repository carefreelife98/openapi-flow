import type {
  NativeInstanceSelectionContext,
  WorkflowNativeMaterialSources,
} from '@openapi-flow/core';
import type { NativeSelectionModelContext } from '../../types/native-selection-model-context.js';

/** Pool exact repeated contracts only; retain every schema, description, value and identity. */
export function createNativeSelectionModelContext(
  context: NativeInstanceSelectionContext,
): NativeSelectionModelContext {
  const snapshot = structuredClone(context);
  const counts = new Map<string, number>();
  for (const capability of snapshot.capabilities) {
    if (capability.materialSources === undefined) continue;
    const key = JSON.stringify(capability.materialSources);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const positions = new Map<string, number>();
  const materialSourceSets: WorkflowNativeMaterialSources[] = [];
  const capabilities = snapshot.capabilities.map((capability) => {
    if (capability.materialSources === undefined) return capability;
    const { materialSources, ...fields } = capability;
    const key = JSON.stringify(materialSources);
    if (counts.get(key) === 1) return capability;
    let position = positions.get(key);
    if (position === undefined) {
      position = materialSourceSets.length;
      positions.set(key, position);
      materialSourceSets.push(materialSources);
    }
    return { ...fields, materialSourcesRef: position };
  });
  return {
    ...snapshot,
    capabilities,
    ...(materialSourceSets.length ? { materialSourceSets } : {}),
  };
}
