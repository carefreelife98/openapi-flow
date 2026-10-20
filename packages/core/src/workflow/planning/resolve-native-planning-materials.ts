import type {
  ResolveNativePlanningMaterialsInput,
  ResolvedNativePlanningMaterials,
} from '../../types/native-node-planning.js';
import { resolveNativeMaterialSnapshot } from '../resolve-native-material-snapshot.js';
import { NativeMaterialResolutionError } from '../native-material-resolution-error.js';
import { validateNativeApiResponseReferences } from '../validate-native-api-response-references.js';

/** Resolve completed materials only; retain unused implementation definitions for later choices. */
export function resolveNativePlanningMaterials(
  input: ResolveNativePlanningMaterialsInput,
): ResolvedNativePlanningMaterials {
  // Static references retain the existing named API diagnostic before dependency resolution.
  // A source-bound definition is inspected by the material resolver, not executed unbound.
  validateNativeApiResponseReferences({
    nativeNodes: input.nativeNodes.filter((node) =>
      input.capabilities.some(
        (capability) =>
          capability.name === node.capability &&
          !capability.bindMaterialContracts,
      ),
    ),
    capabilities: input.capabilities,
    apiCallIds: input.apiMaterials.map((material) => material.callId),
  });
  const result = resolveNativeMaterialSnapshot({
    ...input,
    deferredNodeIds: [],
  });
  if (result.status !== 'ready')
    throw new NativeMaterialResolutionError(result.pending);
  return {
    outputs: result.outputs,
    capabilities: input.capabilities.map((definition) => {
      if (
        !input.nativeNodes.some((node) => node.capability === definition.name)
      )
        return definition;
      const bound = result.capabilities.find(
        (candidate) => candidate.name === definition.name,
      );
      if (!bound)
        throw new Error(
          'Native planning material binding is missing ' + definition.name,
        );
      return bound;
    }),
  };
}
