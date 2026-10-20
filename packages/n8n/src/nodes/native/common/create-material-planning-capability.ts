import type { N8nNativeCapability } from '../../../types/native-capability.js';
import type { NativeMaterialFeatureDefinition } from '../../../types/native-material-binding.js';
import { defineMaterialBoundCapability } from './define-material-bound-capability.js';

/** A stable implementation definition, not a ready output contract or executable node. */
export function createMaterialPlanningCapability(
  definition: NativeMaterialFeatureDefinition,
  bind: NonNullable<N8nNativeCapability['bindMaterialContracts']>,
): N8nNativeCapability {
  function requireBinding(): never {
    throw new Error(
      `Native feature ${definition.name} requires actual material contract binding before value references, output or compilation`,
    );
  }
  return defineMaterialBoundCapability({
    ...definition,
    bindMaterialContracts: bind,
    responseReferences: requireBinding,
    outputSchema: requireBinding,
    compile: requireBinding,
  });
}
