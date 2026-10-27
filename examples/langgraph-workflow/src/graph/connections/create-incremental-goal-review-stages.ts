import type { RunnableConfig } from '@langchain/core/runnables';
import type { WorkflowConnectionSession } from '@openapi-flow/core';
import { reviewWorkflowConnectionGoals } from '@openapi-flow/langchain';
import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionState,
  IncrementalConnectionUpdate,
  IncrementalConnectionStageRuntime,
} from '../../types/incremental-connections.js';
import { resolveIncrementalConnectionSource } from './resolve-incremental-connection-source.js';
import { createIncrementalConnectionSignal } from './check-incremental-connection-budget.js';

/** Candidates are not current accepted goals until the explicitly enabled independent review returns. */
export function stageInitialConnectionGoalCandidate(
  dependencies: IncrementalConnectionDependencies,
  session: WorkflowConnectionSession,
): IncrementalConnectionUpdate {
  return {
    ...(dependencies.initialGoalReview === undefined
      ? {
          session,
          nextModelStage:
            dependencies.outlinePlanning === undefined
              ? ('step' as const)
              : ('outline' as const),
        }
      : {
          pendingGoalSession: session,
          nextModelStage: 'goal-review' as const,
        }),
    pendingMaterialRepair: undefined,
    recoveryPhase: undefined,
    outline: undefined,
    pendingBundleId: undefined,
  };
}

export function createIncrementalGoalReviewStages(
  dependencies: IncrementalConnectionDependencies,
  runtime: IncrementalConnectionStageRuntime,
) {
  async function reviewGoals(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    return runtime.invokeModelStage(async () => {
      runtime.check(state, config);
      if (
        !dependencies.initialGoalReview ||
        !state.pendingGoalSession ||
        !state.goalReviews ||
        state.session !== undefined
      )
        throw new Error(
          'Initial goal review requires its model, pending candidate and review history before accepting a session',
        );
      const review = await reviewWorkflowConnectionGoals({
        ...resolveIncrementalConnectionSource(dependencies, state),
        session: state.pendingGoalSession,
        model: dependencies.initialGoalReview.model,
        signal: createIncrementalConnectionSignal({
          state,
          policy: dependencies.policy,
          config,
        }),
      });
      runtime.check(state, config);
      return {
        goalReviews: [
          ...state.goalReviews,
          { session: state.pendingGoalSession, review },
        ],
        pendingGoalSession: undefined,
        ...(review.accepted
          ? {
              session: state.pendingGoalSession,
              nextModelStage:
                dependencies.outlinePlanning === undefined
                  ? ('step' as const)
                  : ('outline' as const),
            }
          : {
              nextModelStage:
                dependencies.materialRecovery === undefined
                  ? ('goals' as const)
                  : ('goal-recovery' as const),
            }),
      };
    });
  }
  return { reviewGoals };
}
