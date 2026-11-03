import type { WorkflowConnectionOutlineDescription } from '@openapi-flow/core';
import { countReadyConnectionInputs } from './count-ready-connection-inputs.js';

/** Explicit example host scheduling policy, independent of workflow execution order. */
export function selectReadyConnectionBundle(
  description: WorkflowConnectionOutlineDescription,
): string {
  const candidates = description.bundles
    .filter((bundle) => bundle.pending)
    .map((status) => {
      const bundle = description.outline.bundles.find(
        (bundle) => bundle.id === status.bundleId,
      );
      if (!bundle)
        throw new Error(
          'Pending connection work requires its original outline bundle',
        );
      const ready = countReadyConnectionInputs(
        description.step,
        bundle.nodeIds,
      );
      return {
        status,
        scope: bundle.scope,
        priority: ready
          ? 0
          : status.pendingNodeIds.length
            ? 2
            : status.unmetGoalIds.length
              ? 1
              : 3,
      };
    })
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        Number(left.scope === 'global') - Number(right.scope === 'global'),
    );
  const first = candidates[0];
  if (!first)
    throw new Error('An incomplete connection outline has no pending work');
  return first.status.bundleId;
}
