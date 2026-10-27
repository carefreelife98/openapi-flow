import type { RunnableConfig } from '@langchain/core/runnables';
import { isDeepStrictEqual } from 'node:util';
import {
  planWorkflowConnectionGoalRecovery,
  createWorkflowConnectionGoalRejection,
} from '@openapi-flow/langchain';
import {
  applyWorkflowConnectionMaterialRepair,
  applyWorkflowConnectionMaterialRepairWork,
  validateWorkflowConnectionSourceRepairRequest,
  describeWorkflowConnectionGoals,
  validateWorkflowConnectionMaterialRepairReceipt,
  describeWorkflowConnectionMaterialRepairWork,
} from '@openapi-flow/core';
import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionState,
  IncrementalConnectionUpdate,
  IncrementalConnectionStageRuntime,
} from '../../types/incremental-connections.js';
import type {
  WorkflowConnectionMaterialReplacement,
  WorkflowConnectionMaterialRepairWorkSubmission,
} from '@openapi-flow/core';
import {
  createIncrementalConnectionSignal,
  countIncrementalConnectionRejections,
} from './check-incremental-connection-budget.js';
import { createMaterialRecoveryModelLease } from './create-material-recovery-model-lease.js';
import { stageInitialConnectionGoalCandidate } from './create-incremental-goal-review-stages.js';
import { describeIncrementalConnectionRevision } from './describe-incremental-connection-revision.js';
import { resolvePendingMaterialSource } from './resolve-pending-material-source.js';

/** Host-owned originating-stage dispatch. Neither callback results nor model decisions mutate the supplied base. */
export function createIncrementalMaterialRecoveryStages(
  dependencies: IncrementalConnectionDependencies,
  runtime: IncrementalConnectionStageRuntime,
) {
  const source = (state: IncrementalConnectionState) =>
    resolvePendingMaterialSource(dependencies, state);
  async function recoverGoals(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    return runtime.invokeModelStage(async () => {
      runtime.check(state, config);
      if (!dependencies.materialRecovery || !state.rejectedGoalProposals)
        throw new Error(
          'Goal recovery requires its explicit host policy and rejection history',
        );
      const current = source(state);
      const fingerprint =
        describeWorkflowConnectionGoals(current).sourceFingerprint;
      try {
        const result = await planWorkflowConnectionGoalRecovery({
          ...current,
          model: dependencies.model,
          signal: createIncrementalConnectionSignal({
            state,
            policy: dependencies.policy,
            config,
          }),
          rejectedProposals: state.rejectedGoalProposals.filter(
            (item) => item.sourceFingerprint === fingerprint,
          ),
          ...(dependencies.initialGoalReview === undefined
            ? {}
            : {
                rejectedGoalReviews: state.goalReviews?.filter(
                  (candidate) =>
                    !candidate.review.accepted &&
                    candidate.review.sourceFingerprint === fingerprint,
                ),
              }),
        });
        runtime.check(state, config);
        if (result.kind === 'goals')
          return stageInitialConnectionGoalCandidate(
            dependencies,
            result.session,
          );
        return {
          pendingMaterialRepair: result,
          recoveryPhase: 'requested',
          nextModelStage: 'material-replan',
        };
      } catch (error) {
        const rejection = createWorkflowConnectionGoalRejection({
          ...source(state),
          error,
        });
        if (!rejection) throw error;
        runtime.check(state, config);
        return {
          rejectedGoalProposals: [...state.rejectedGoalProposals, rejection],
          nextModelStage: 'goal-recovery',
        };
      }
    });
  }
  async function replanMaterial(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    return runtime.invokeModelStage(async () => {
      runtime.check(state, config);
      if (!dependencies.materialRecovery || !state.pendingMaterialRepair)
        throw new Error(
          'Originating-stage replan requires the explicit host callback and source-bound request',
        );
      const current = source(state);
      validateWorkflowConnectionSourceRepairRequest({
        source: current,
        request: state.pendingMaterialRepair,
      });
      if (state.pendingRevisionMaterialRequest)
        validateWorkflowConnectionMaterialRepairReceipt({
          ...describeIncrementalConnectionRevision(dependencies, state),
          receipt: state.pendingRevisionMaterialRequest,
        });
      const snapshot = {
        ...structuredClone({ ...current, capabilities: undefined }),
        ...(current.capabilities === undefined
          ? {}
          : {
              capabilities: current.capabilities.map((capability) => ({
                ...capability,
              })),
            }),
      };
      const signal = createIncrementalConnectionSignal({
        state,
        policy: dependencies.policy,
        config,
      });
      const lease = createMaterialRecoveryModelLease(
        dependencies.model,
        dependencies.materialRecovery.modelInvocations,
        signal,
      );
      let replacement:
        | WorkflowConnectionMaterialReplacement
        | WorkflowConnectionMaterialRepairWorkSubmission;
      try {
        replacement = await dependencies.materialRecovery.replan({
          source: snapshot,
          request: structuredClone(state.pendingMaterialRepair),
          model: lease.model,
          signal,
        });
      } finally {
        lease.close();
      }
      runtime.check(state, config);
      validateWorkflowConnectionSourceRepairRequest({
        source: source(state),
        request: state.pendingMaterialRepair,
      });
      if (
        typeof replacement === 'object' &&
        replacement !== null &&
        'kind' in replacement
      ) {
        if (replacement.kind !== 'dependent-api-arguments')
          throw new Error('Unknown material recovery result kind');
        if (dependencies.materialRecovery.argumentPlanning)
          throw new Error(
            'materialRecovery.argumentPlanning requires a pending replacement, not completed dependent work',
          );
        return {
          pendingMaterialReplacement: undefined,
          pendingMaterialWork: replacement,
          recoveryPhase: 'replanned',
        };
      }
      if (dependencies.materialRecovery.argumentPlanning) {
        const work = describeWorkflowConnectionMaterialRepairWork({
          source: source(state),
          request: state.pendingMaterialRepair,
          replacement,
        });
        if (work.apiArgumentTasks.length > 0)
          return {
            pendingMaterialArgumentWork: {
              work,
              pendingReplacement: replacement,
              completedArguments: [],
            },
            pendingMaterialReplacement: undefined,
            pendingMaterialWork: undefined,
            recoveryPhase: 'replanned',
            nextModelStage: 'material-api-arguments',
          };
      }
      return {
        pendingMaterialReplacement: replacement,
        pendingMaterialWork: undefined,
        recoveryPhase: 'replanned',
      };
    });
  }
  function applyMaterial(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): IncrementalConnectionUpdate {
    runtime.check(state, config);
    if (
      !state.pendingMaterialRepair ||
      (!state.pendingMaterialReplacement && !state.pendingMaterialWork) ||
      !state.materialRepairs
    )
      throw new Error(
        'Material application requires the original request, actual result and repair history',
      );
    if (state.pendingMaterialReplacement && state.pendingMaterialWork)
      throw new Error(
        'Material application must have exactly one replacement or dependent-work result',
      );
    if (
      state.pendingMaterialWork &&
      !isDeepStrictEqual(
        state.pendingMaterialWork.work.originalRequest,
        state.pendingMaterialRepair,
      )
    )
      throw new Error(
        'Dependent material work does not belong to the original pending request',
      );
    const result =
      state.pendingMaterialWork === undefined
        ? applyWorkflowConnectionMaterialRepair({
            source: source(state),
            request: state.pendingMaterialRepair,
            replacement: state.pendingMaterialReplacement!,
          })
        : applyWorkflowConnectionMaterialRepairWork({
            source: source(state),
            ...state.pendingMaterialWork,
          });
    if (state.pendingRevisionMaterialRequest !== undefined) {
      if (
        !state.pendingRevisionRepairs ||
        !state.session ||
        !dependencies.revisionPlanning
      )
        throw new Error(
          'Accepted material candidate requires its revision policy, original session and candidate history',
        );
      validateWorkflowConnectionMaterialRepairReceipt({
        ...describeIncrementalConnectionRevision(dependencies, state),
        receipt: state.pendingRevisionMaterialRequest,
      });
      return {
        pendingRevisionRepairs: [
          ...state.pendingRevisionRepairs,
          result.receipt,
        ],
        pendingRevisionMaterialRequest: undefined,
        pendingMaterialReplacement: undefined,
        pendingMaterialWork: undefined,
        recoveryPhase: 'applied',
        nextModelStage: 'revision',
      };
    }
    if (state.session !== undefined)
      throw new Error(
        'Accepted material cannot be replaced without an explicit pending revision request',
      );
    return {
      materialRepairs: [...state.materialRepairs, result.receipt],
      ...(dependencies.revisionPlanning === undefined
        ? {}
        : {
            sourceEvents: [
              ...state.sourceEvents!,
              { kind: 'material-repair' as const, receipt: result.receipt },
            ],
          }),
      pendingMaterialReplacement: undefined,
      pendingMaterialWork: undefined,
      recoveryPhase: 'applied',
      nextModelStage: 'goals',
    };
  }
  async function publishRecovery(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    runtime.check(state, config);
    if (
      !dependencies.materialRecovery ||
      !state.pendingMaterialRepair ||
      !state.recoveryPhase ||
      state.modelInvocations === undefined
    )
      throw new Error(
        'Recovery progress requires an explicit phase, request and invocation accounting',
      );
    await dependencies.materialRecovery.observe?.({
      phase: state.recoveryPhase,
      targets: structuredClone(state.pendingMaterialRepair.request.targets),
      modelInvocations: state.modelInvocations,
      rejectedProposals: countIncrementalConnectionRejections(state),
    });
    return {};
  }
  return { recoverGoals, replanMaterial, applyMaterial, publishRecovery };
}
