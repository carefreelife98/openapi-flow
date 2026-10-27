import type { ApiBindingMaterial } from '../../types/api-bindings.js';
import type { WorkflowCapability } from '../../types/workflow-plan.js';
import { nativeMaterialRequirementsSchema } from '../../schemas/native-material-requirements-schema.js';
import { bindNativeMaterialContracts } from '../bind-native-material-contracts.js';

/** API contracts are fixed before planning; future native producers are not yet value contracts. */
export function bindApiPlanningMaterialContracts(
  capabilities: WorkflowCapability[],
  apiMaterials: ApiBindingMaterial[],
): WorkflowCapability[] {
  return capabilities.map((definition) => {
    if (
      definition.bindMaterialContracts === undefined ||
      definition.materialRequirements === undefined
    )
      return definition;
    const requirements = nativeMaterialRequirementsSchema.parse(
      definition.materialRequirements,
    );
    if (
      !requirements.length ||
      requirements.some(
        (requirement) =>
          requirement.field !== 'apiMaterials' ||
          apiMaterials.length < requirement.minimumItems,
      )
    )
      return definition;
    return bindNativeMaterialContracts(definition, {
      apiMaterials,
      nativeOutputs: [],
    });
  });
}
