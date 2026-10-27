import type { WorkflowConnectionSessionSource } from '@openapi-flow/core';
import {
  describeWorkflowConnectionGoals,
  replayWorkflowConnectionMaterialRepair,
} from '@openapi-flow/core';
import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionState,
} from '../../types/incremental-connections.js';
import { replayIncrementalConnectionSourceEvents } from './replay-incremental-connection-source-events.js';

export function resolveIncrementalConnectionSource(
  dependencies: IncrementalConnectionDependencies,
  state: IncrementalConnectionState,
): WorkflowConnectionSessionSource {
  if (dependencies.revisionPlanning !== undefined)
    return replayIncrementalConnectionSourceEvents(dependencies, state).source;
  let base = dependencies.source();
  if (dependencies.materialRecovery !== undefined) {
    if (
      state.materialRepairs === undefined ||
      state.materialSourceFingerprint === undefined
    )
      throw new Error(
        'Material recovery requires its immutable source fingerprint and repair receipts',
      );
    if (
      describeWorkflowConnectionGoals(base).sourceFingerprint !==
      state.materialSourceFingerprint
    )
      throw new Error(
        'Original material recovery source changed; no automatic rebase',
      );
    for (const receipt of state.materialRepairs)
      base = replayWorkflowConnectionMaterialRepair({ source: base, receipt });
  }
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
