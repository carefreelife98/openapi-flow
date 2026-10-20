import type { WorkflowCapability } from '../types/workflow-plan.js';
import type { WorkflowNativeMaterialSources } from '../types/native-material-snapshot.js';
import { jsonValuesEqual } from '../utils/json-values-equal.js';

/** Static implementations retain their definition; material-dependent implementations receive actual contracts. */
export function bindNativeMaterialContracts(
  definition: WorkflowCapability,
  sources: WorkflowNativeMaterialSources,
): WorkflowCapability {
  if (!definition.bindMaterialContracts) return definition;
  const bound = definition.bindMaterialContracts(structuredClone(sources));
  if (
    !bound ||
    bound.name !== definition.name ||
    typeof bound.parametersSchema?.parse !== 'function'
  )
    throw new Error(
      `Native material binding ${definition.name} must retain its capability identity and parameter contract`,
    );
  if (!bound.materialSources)
    throw new Error(
      `Native material binding ${definition.name} must declare its actual materialSources`,
    );
  if (
    !jsonValuesEqual(
      bound.parameterReferenceSources,
      definition.parameterReferenceSources,
    )
  )
    throw new Error(
      `Native material binding ${definition.name} must retain its declared parameterReferenceSources`,
    );
  return bound;
}
