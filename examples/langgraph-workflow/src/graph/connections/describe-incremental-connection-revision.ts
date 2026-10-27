import {
  describeWorkflowConnectionStep,
  replayWorkflowConnectionMaterialRepair,
} from '@openapi-flow/core';
import type { WorkflowConnectionRevisionInput } from '@openapi-flow/core';
import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionState,
} from '../../types/incremental-connections.js';
import { resolveIncrementalConnectionSource } from './resolve-incremental-connection-source.js';

/** Unadopted material stays separate from the canonical accepted source and graph. */
export function describeIncrementalConnectionRevision(
  dependencies: IncrementalConnectionDependencies,
  state: IncrementalConnectionState,
): WorkflowConnectionRevisionInput {
  if (
    !dependencies.revisionPlanning ||
    !state.session ||
    !state.pendingRevisionRepairs
  )
    throw new Error(
      'Accepted revision requires its explicit policy, session and candidate repair history',
    );
  const source = resolveIncrementalConnectionSource(dependencies, state);
  const before = { ...source, session: state.session };
  let after = source;
  for (const receipt of state.pendingRevisionRepairs)
    after = replayWorkflowConnectionMaterialRepair({ source: after, receipt });
  return {
    before,
    after,
    expected: describeWorkflowConnectionStep(before).expected,
  };
}
