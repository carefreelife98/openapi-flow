import { isDeepStrictEqual } from 'node:util';
import type { WorkflowNativeMaterialSources } from '@openapi-flow/core';
import type { MaterialBindableN8nCapability } from '../../../types/native-material-binding.js';
import type { N8nNativeCapability } from '../../../types/native-capability.js';

/** A material binder cannot silently discard a caller's different implementation or source receipt. */
export function defineMaterialBoundCapability(
  definition: MaterialBindableN8nCapability,
): N8nNativeCapability {
  if (definition.materialRequirements !== undefined)
    definition.materialRequirements = structuredClone(
      definition.materialRequirements,
    );
  const requirements = structuredClone(definition.materialRequirements);
  if (definition.parameterReferenceSources !== undefined)
    definition.parameterReferenceSources = structuredClone(
      definition.parameterReferenceSources,
    );
  const referenceSources = structuredClone(
    definition.parameterReferenceSources,
  );
  const bind = definition.bindMaterialContracts;
  const fields = new Map(
    Object.entries(definition).filter(
      ([key]) => key !== 'bindMaterialContracts' && key !== 'materialSources',
    ),
  );
  const receipts = structuredClone(definition.materialSources);
  definition.bindMaterialContracts = function (
    this: N8nNativeCapability,
    sources: WorkflowNativeMaterialSources,
  ): N8nNativeCapability {
    const changed = [...fields]
      .filter(([key, value]) => Reflect.get(this, key) !== value)
      .map(([key]) => key);
    const extra = Object.keys(this).filter(
      (key) =>
        key !== 'bindMaterialContracts' &&
        key !== 'materialSources' &&
        !fields.has(key),
    );
    if (!isDeepStrictEqual(this.materialSources, receipts))
      changed.push('materialSources');
    if (
      !isDeepStrictEqual(this.parameterReferenceSources, referenceSources) &&
      !changed.includes('parameterReferenceSources')
    )
      changed.push('parameterReferenceSources');
    if (
      !isDeepStrictEqual(this.materialRequirements, requirements) &&
      !changed.includes('materialRequirements')
    )
      changed.push('materialRequirements');
    if (changed.length || extra.length)
      throw new Error(
        `Native material definition ${definition.name} changed ${[...changed, ...extra].join(', ')} without a coherent bindMaterialContracts implementation`,
      );
    return bind.call(this, sources);
  };
  return definition;
}
