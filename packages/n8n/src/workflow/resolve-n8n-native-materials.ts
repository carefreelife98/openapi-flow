import {
  resolveNativeMaterialSnapshot,
  NativeMaterialResolutionError,
} from '@openapi-flow/core';
import type {
  ResolveN8nNativeMaterialsInput,
  ResolvedN8nNativeMaterials,
} from '../types/native-material-binding.js';
import type { N8nNativeCapability } from '../types/native-capability.js';

export function resolveN8nNativeMaterials(
  input: ResolveN8nNativeMaterialsInput,
): ResolvedN8nNativeMaterials {
  const snapshot = resolveNativeMaterialSnapshot({
    ...input,
    deferredNodeIds: [],
  });
  if (snapshot.status !== 'ready')
    throw new NativeMaterialResolutionError(snapshot.pending);
  for (const capability of snapshot.capabilities)
    if (!('compile' in capability) || typeof capability.compile !== 'function')
      throw new Error(
        `Native material binding ${capability.name} did not retain its n8n compiler`,
      );
  return {
    capabilities: snapshot.capabilities as N8nNativeCapability[],
    outputs: snapshot.outputs,
  };
}
