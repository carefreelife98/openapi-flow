import type { NativeMaterialFeatureDefinition } from '../../../types/native-material-binding.js';
import type { N8nNativeFeatureContextRequirement } from '../../../types/native-feature-registry.js';

export function nativeFeatureMaterialRequirements(
  definition: NativeMaterialFeatureDefinition,
): N8nNativeFeatureContextRequirement[] {
  if (!definition.materialRequirements)
    throw new Error(
      `Native feature ${definition.name} has no declared material requirements`,
    );
  return definition.materialRequirements.map((requirement) => ({
    field:
      requirement.field === 'nativeOutputs'
        ? 'nativeOutputSources'
        : requirement.field,
    minimumItems: requirement.minimumItems,
  }));
}
