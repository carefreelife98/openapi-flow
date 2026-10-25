import type { WorkflowConnectionSessionSource } from '@openapi-flow/core';
import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionState,
} from '../../types/incremental-connections.js';

export function resolveIncrementalConnectionSource(
  dependencies: IncrementalConnectionDependencies,
  state: IncrementalConnectionState,
): WorkflowConnectionSessionSource {
  const base = dependencies.source();
  if (
    state.additionalNativeNodes === undefined ||
    state.additionalNativeNodes.length === 0
  )
    return base;
  return {
    ...base,
    nativeNodes:
      base.nativeNodes === undefined
        ? [...state.additionalNativeNodes]
        : [...base.nativeNodes, ...state.additionalNativeNodes],
  };
}
