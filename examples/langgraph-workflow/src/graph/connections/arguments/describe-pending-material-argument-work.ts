import { isDeepStrictEqual } from 'node:util';
import {
  describeWorkflowConnectionMaterialRepairWork,
  inspectApiArgumentRequirements,
} from '@openapi-flow/core';
import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionState,
} from '../../../types/incremental-connections.js';
import { resolvePendingMaterialSource } from '../resolve-pending-material-source.js';

/** Re-derive tasks from actual OAS and bindings on every checkpoint boundary. */
export function describePendingMaterialArgumentWork(
  dependencies: IncrementalConnectionDependencies,
  state: IncrementalConnectionState,
) {
  const pending = state.pendingMaterialArgumentWork;
  if (!dependencies.materialRecovery?.argumentPlanning || !pending)
    throw new Error(
      'Material argument work requires materialRecovery.argumentPlanning and its checkpoint',
    );
  if (
    !state.pendingMaterialRepair ||
    !isDeepStrictEqual(
      pending.work.originalRequest,
      state.pendingMaterialRepair,
    )
  )
    throw new Error('Material argument work differs from the pending request');
  const work = describeWorkflowConnectionMaterialRepairWork({
    source: resolvePendingMaterialSource(dependencies, state),
    request: state.pendingMaterialRepair,
    replacement: pending.pendingReplacement,
  });
  if (!isDeepStrictEqual(work, pending.work))
    throw new Error(
      'Material argument checkpoint differs from current OAS or bindings',
    );
  if (pending.completedArguments.length > work.apiArgumentTasks.length)
    throw new Error('Material argument checkpoint contains unassigned results');
  for (const [index, result] of pending.completedArguments.entries()) {
    const task = work.apiArgumentTasks[index]!;
    if (
      result.callId !== task.input.callId ||
      !isDeepStrictEqual(result.bindings, task.input.bindings) ||
      result.requestMediaType !== task.input.requestMediaType
    )
      throw new Error(
        'Material argument checkpoint changed its task, bindings or media type',
      );
    const inspection = inspectApiArgumentRequirements({
      ...task.input,
      ...result,
    });
    if (
      !isDeepStrictEqual(
        inspection.requirements.map((item) => item.targetPointer),
        result.unresolvedInputs,
      )
    )
      throw new Error(
        'Material argument checkpoint changed its missing-input report',
      );
  }
  return { ...pending, work };
}
