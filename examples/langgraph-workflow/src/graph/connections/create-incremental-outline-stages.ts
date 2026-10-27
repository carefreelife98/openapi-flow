import type { RunnableConfig } from '@langchain/core/runnables';
import {
  planWorkflowConnectionOutline,
  describeWorkflowConnectionOutlineRequest,
  createWorkflowConnectionOutlineRejection,
} from '@openapi-flow/langchain';
import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionState,
  IncrementalConnectionUpdate,
  IncrementalConnectionStageRuntime,
} from '../../types/incremental-connections.js';
import { createIncrementalConnectionSignal } from './check-incremental-connection-budget.js';
import { resolveIncrementalConnectionSource } from './resolve-incremental-connection-source.js';

export function createIncrementalOutlineStages(
  dependencies: IncrementalConnectionDependencies,
  runtime: IncrementalConnectionStageRuntime,
) {
  async function outline(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    return runtime.invokeModelStage(async () => {
      runtime.check(state, config);
      if (
        !dependencies.outlinePlanning ||
        !state.session ||
        !state.outlineHistory ||
        !state.rejectedOutlineProposals
      )
        throw new Error(
          'Outline planning requires its explicit runtime, accepted goals and history',
        );
      const input = {
        ...resolveIncrementalConnectionSource(dependencies, state),
        session: state.session,
        ...(state.outline === undefined
          ? {}
          : { previousOutline: state.outline }),
      };
      const request = describeWorkflowConnectionOutlineRequest(input);
      try {
        const result = await planWorkflowConnectionOutline({
          ...input,
          model: dependencies.outlinePlanning.model,
          rejectedProposals: state.rejectedOutlineProposals.filter(
            (item) => item.requestFingerprint === request.requestFingerprint,
          ),
          signal: createIncrementalConnectionSignal({
            state,
            policy: dependencies.policy,
            config,
          }),
        });
        runtime.check(state, config);
        return {
          outline: result,
          outlineHistory: [...state.outlineHistory, result],
          nextModelStage: 'step',
          pendingBundleId: undefined,
        };
      } catch (error) {
        // Classify against the current source, not a snapshot captured before the await.
        const rejection = createWorkflowConnectionOutlineRejection({
          ...resolveIncrementalConnectionSource(dependencies, state),
          session: state.session,
          ...(state.outline === undefined
            ? {}
            : { previousOutline: state.outline }),
          error,
        });
        if (rejection === undefined) throw error;
        runtime.check(state, config);
        return {
          rejectedOutlineProposals: [
            ...state.rejectedOutlineProposals,
            rejection,
          ],
          nextModelStage: 'outline',
        };
      }
    });
  }
  async function publishOutline(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    runtime.check(state, config);
    if (!dependencies.outlinePlanning || !state.outline)
      throw new Error(
        'Outline progress requires its saved result and explicit runtime policy',
      );
    await dependencies.outlinePlanning.observe?.(
      structuredClone(state.outline),
    );
    return {};
  }
  return { outline, publishOutline };
}
