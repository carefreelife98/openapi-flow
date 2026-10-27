import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionState,
} from '../../types/incremental-connections.js';
import { resolveIncrementalConnectionSource } from './resolve-incremental-connection-source.js';
import { describeIncrementalConnectionRevision } from './describe-incremental-connection-revision.js';

/** An accepted-plan repair changes its private candidate, never the current accepted source. */
export function resolvePendingMaterialSource(
  dependencies: IncrementalConnectionDependencies,
  state: IncrementalConnectionState,
) {
  return state.pendingRevisionMaterialRequest === undefined
    ? resolveIncrementalConnectionSource(dependencies, state)
    : describeIncrementalConnectionRevision(dependencies, state).after;
}
