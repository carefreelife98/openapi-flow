import type { RunnableConfig } from '@langchain/core/runnables';
import { isDeepStrictEqual } from 'node:util';
import { generateApiArguments } from '@openapi-flow/langchain';
import {
  selectWorkflowConnectionArgumentValues,
  inspectWorkflowConnectionMaterialRepairInputs,
} from '@openapi-flow/core';
import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionStageRuntime,
  IncrementalConnectionState,
  IncrementalConnectionUpdate,
} from '../../../types/incremental-connections.js';
import { createIncrementalConnectionSignal } from '../check-incremental-connection-budget.js';
import { describePendingMaterialArgumentWork } from './describe-pending-material-argument-work.js';
import { resolvePendingMaterialSource } from '../resolve-pending-material-source.js';

/** One OAS-derived API task per node invocation; the next node observes a committed result. */
export function createMaterialArgumentStages(
  dependencies: IncrementalConnectionDependencies,
  runtime: IncrementalConnectionStageRuntime,
) {
  async function generateMaterialArguments(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    return runtime.invokeModelStage(async () => {
      runtime.check(state, config);
      const pending = structuredClone(
        describePendingMaterialArgumentWork(dependencies, state),
      );
      const task =
        pending.work.apiArgumentTasks[pending.completedArguments.length];
      if (!task)
        throw new Error('Material argument generation has no remaining task');
      const result = await generateApiArguments({
        ...task.input,
        model: dependencies.materialRecovery!.argumentPlanning!.model,
        signal: createIncrementalConnectionSignal({
          state,
          policy: dependencies.policy,
          config,
        }),
        trackRequestedInputs: true,
      });
      runtime.check(state, config);
      if (
        !isDeepStrictEqual(
          pending,
          describePendingMaterialArgumentWork(dependencies, state),
        )
      )
        throw new Error(
          'Material argument checkpoint changed during model generation',
        );
      const completed = {
        ...pending,
        completedArguments: [...pending.completedArguments, result],
      };
      describePendingMaterialArgumentWork(dependencies, {
        ...state,
        pendingMaterialArgumentWork: completed,
      });
      return { pendingMaterialArgumentWork: completed };
    });
  }
  async function publishMaterialArguments(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    runtime.check(state, config);
    const pending = describePendingMaterialArgumentWork(dependencies, state);
    const completed = pending.completedArguments.at(-1);
    if (!completed || state.modelInvocations === undefined)
      throw new Error(
        'Material argument progress requires a saved result and invocation count',
      );
    await dependencies.materialRecovery!.argumentPlanning!.observe?.({
      callId: completed.callId,
      completed: pending.completedArguments.length,
      total: pending.work.apiArgumentTasks.length,
      modelInvocations: state.modelInvocations,
    });
    runtime.check(state, config);
    describePendingMaterialArgumentWork(dependencies, state);
    return {};
  }
  function finishMaterialArguments(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): IncrementalConnectionUpdate {
    runtime.check(state, config);
    const pending = describePendingMaterialArgumentWork(dependencies, state);
    if (
      pending.completedArguments.length !== pending.work.apiArgumentTasks.length
    )
      throw new Error(
        'Material argument submission requires every assigned API result',
      );
    const results = new Map(
      pending.completedArguments.map((args) => [args.callId, args]),
    );
    const replacement = {
      ...pending.pendingReplacement,
      apiArguments: pending.pendingReplacement.apiArguments.map((original) => {
        const result = results.get(original.callId);
        return result === undefined
          ? original
          : {
              callId: result.callId,
              ...selectWorkflowConnectionArgumentValues(result),
            };
      }),
    };
    const inputPolicy =
      dependencies.materialRecovery!.argumentPlanning!
        .selectDeferredApiInputIds;
    if (inputPolicy !== undefined) {
      // Pending approvals preceded these values. Present them separately to the explicit final policy.
      const { deferredApiInputIds, ...unapprovedReplacement } = replacement;
      const inspection = inspectWorkflowConnectionMaterialRepairInputs({
        source: resolvePendingMaterialSource(dependencies, state),
        request: pending.work.request,
        replacement: unapprovedReplacement,
      });
      replacement.deferredApiInputIds = inputPolicy(
        inspection,
        deferredApiInputIds,
      );
    }
    return {
      pendingMaterialWork: {
        kind: 'dependent-api-arguments',
        work: pending.work,
        pendingReplacement: pending.pendingReplacement,
        replacement,
      },
      pendingMaterialArgumentWork: undefined,
      recoveryPhase: 'replanned',
    };
  }
  function materialArgumentsComplete(
    state: IncrementalConnectionState,
  ): boolean {
    const pending = describePendingMaterialArgumentWork(dependencies, state);
    return (
      pending.completedArguments.length === pending.work.apiArgumentTasks.length
    );
  }
  return {
    generateMaterialArguments,
    publishMaterialArguments,
    finishMaterialArguments,
    materialArgumentsComplete,
  };
}
