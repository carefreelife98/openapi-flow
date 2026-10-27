import type { RunnableConfig } from '@langchain/core/runnables';
import { randomUUID } from 'node:crypto';
import {
  describeWorkflowConnectionStep,
  applyWorkflowConnectionStep,
  inspectWorkflowConnectionCompletion,
  finalizeWorkflowConnectionSession,
  describeWorkflowConnectionGoals,
  validateWorkflowConnectionGoalReview,
  describeWorkflowConnectionOutline,
  applyWorkflowConnectionOutlineStep,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionGoals,
  planWorkflowConnectionStep,
  createWorkflowConnectionGoalRejection,
} from '@openapi-flow/langchain';
import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionState,
  IncrementalConnectionUpdate,
  IncrementalConnectionRuntimeFailure,
} from '../../types/incremental-connections.js';
import {
  checkIncrementalConnectionBudget,
  createIncrementalConnectionSignal,
  IncrementalConnectionLimitError,
  countIncrementalConnectionRejections,
} from './check-incremental-connection-budget.js';
import { resolveIncrementalConnectionSource } from './resolve-incremental-connection-source.js';
import { createIncrementalNativeStages } from './native/create-incremental-native-stages.js';
import { createIncrementalOutlineStages } from './create-incremental-outline-stages.js';
import { createIncrementalRevisionStages } from './create-incremental-revision-stages.js';
import { replayIncrementalConnectionSourceEvents } from './replay-incremental-connection-source-events.js';
import { createIncrementalMaterialRecoveryStages } from './create-incremental-material-recovery-stages.js';
import { createMaterialArgumentStages } from './arguments/create-material-argument-stages.js';
import {
  createIncrementalGoalReviewStages,
  stageInitialConnectionGoalCandidate,
} from './create-incremental-goal-review-stages.js';

export function createIncrementalConnectionStages(
  dependencies: IncrementalConnectionDependencies,
) {
  function source(state: IncrementalConnectionState) {
    return resolveIncrementalConnectionSource(dependencies, state);
  }
  // Only the reference is checkpointed. The original exception stays private in this run's runtime.
  let failure: IncrementalConnectionRuntimeFailure | undefined;
  async function invokeModelStage(
    execute: () => Promise<IncrementalConnectionUpdate>,
  ): Promise<IncrementalConnectionUpdate> {
    try {
      return await execute();
    } catch (error) {
      failure = { id: randomUUID(), error };
      return { failureId: failure.id };
    }
  }
  function fail(state: IncrementalConnectionState): never {
    if (!state.failureId || !failure || failure.id !== state.failureId)
      throw new Error(
        'Original connection failure is unavailable in this run runtime',
      );
    throw failure.error;
  }
  function check(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): void {
    checkIncrementalConnectionBudget({
      state,
      policy: dependencies.policy,
      config,
    });
  }
  function initialize(
    state: IncrementalConnectionState,
  ): IncrementalConnectionUpdate {
    if (state.session !== undefined) {
      check(state);
      if (
        dependencies.revisionPlanning === undefined &&
        state.sourceEvents !== undefined
      )
        throw new Error(
          'Revision checkpoint requires its explicit runtime policy',
        );
      if (
        dependencies.revisionPlanning !== undefined &&
        (!state.sourceEvents ||
          !state.pendingRevisionRepairs ||
          !state.rejectedRevisions ||
          !state.rejectedRevisionReviews)
      )
        throw new Error(
          'Revision resume requires its ordered source and rejection/candidate histories',
        );
      const replay =
        dependencies.revisionPlanning === undefined
          ? undefined
          : replayIncrementalConnectionSourceEvents(dependencies, state);
      if (
        dependencies.outlinePlanning === undefined &&
        (state.outline !== undefined ||
          state.outlineHistory !== undefined ||
          state.rejectedOutlineProposals !== undefined ||
          state.pendingBundleId !== undefined)
      )
        throw new Error(
          'Outline checkpoint requires its explicit runtime policy',
        );
      if (dependencies.outlinePlanning !== undefined) {
        if (
          !state.outlineHistory ||
          !state.rejectedOutlineProposals ||
          (!state.outline && state.nextModelStage !== 'outline')
        )
          throw new Error(
            'Outline resumption requires its checked outline/history or an explicitly pending outline stage',
          );
        if (state.outline)
          describeWorkflowConnectionOutline({
            ...source(state),
            session: state.session,
            outline: state.outline,
          });
      }
      const reviewedRevision = state.sourceEvents?.some(
        (event) =>
          event.kind === 'accepted-revision' &&
          event.revision.session.id === state.session!.id &&
          event.review?.accepted,
      );
      if (dependencies.initialGoalReview !== undefined && !reviewedRevision) {
        const candidate = state.goalReviews?.find(
          (item) =>
            item.session.id === state.session!.id && item.review.accepted,
        );
        if (!candidate)
          throw new Error(
            'Initial goal review resume requires its accepted original candidate and receipt',
          );
        const reviewSource =
          replay === undefined
            ? source({ ...state, additionalNativeNodes: [] })
            : replay.epochs.get(candidate.review.sourceFingerprint);
        if (!reviewSource)
          throw new Error(
            'Original reviewed material epoch is unavailable in the source ledger',
          );
        validateWorkflowConnectionGoalReview({
          ...reviewSource,
          session: candidate.session,
          review: candidate.review,
        });
      }
      if (
        dependencies.nativeAugmentation !== undefined &&
        (!state.additionalNativeNodes || !state.materialExtensions)
      )
        throw new Error(
          'Automatic native resumption requires additionalNativeNodes and materialExtensions',
        );
      describeWorkflowConnectionStep({
        ...source(state),
        session: state.session,
      });
      return {
        status: 'planning',
        pending: undefined,
        plan: undefined,
        nextModelStage:
          dependencies.revisionPlanning !== undefined &&
          state.revisionPhase !== undefined &&
          state.revisionPhase !== 'adopted'
            ? state.nextModelStage
            : dependencies.outlinePlanning !== undefined &&
                state.outline === undefined
              ? 'outline'
              : 'step',
        failureId: undefined,
      };
    }
    if (
      state.startedAt !== undefined ||
      state.modelInvocations !== undefined ||
      state.rejectedProposals !== undefined ||
      state.rejectedGoalProposals !== undefined ||
      state.pendingGoalSession !== undefined ||
      state.goalReviews !== undefined ||
      state.outline !== undefined ||
      state.outlineHistory !== undefined ||
      state.rejectedOutlineProposals !== undefined ||
      state.pendingBundleId !== undefined ||
      state.sourceEvents !== undefined ||
      state.pendingRevisionRepairs !== undefined ||
      state.rejectedRevisions !== undefined ||
      state.rejectedRevisionReviews !== undefined ||
      state.pendingRevision !== undefined ||
      state.pendingRevisionMaterialRequest !== undefined ||
      state.pendingRevisionReview !== undefined ||
      state.revisionPhase !== undefined ||
      state.pendingMaterialArgumentWork !== undefined
    )
      throw new Error(
        'A fresh connection run must not contain previous accounting without its session',
      );
    return {
      startedAt: Date.now(),
      modelInvocations: 0,
      rejectedProposals: [],
      rejectedGoalProposals: [],
      status: 'planning',
      nextModelStage: 'goals',
      additionalNativeNodes: [],
      materialExtensions: [],
      ...(dependencies.outlinePlanning === undefined
        ? {}
        : { outlineHistory: [], rejectedOutlineProposals: [] }),
      ...(dependencies.initialGoalReview === undefined
        ? {}
        : { goalReviews: [] }),
      ...(dependencies.revisionPlanning === undefined
        ? {}
        : {
            sourceEvents: [],
            pendingRevisionRepairs: [],
            rejectedRevisions: [],
            rejectedRevisionReviews: [],
          }),
      ...(dependencies.materialRecovery === undefined &&
      dependencies.revisionPlanning === undefined
        ? {}
        : {
            materialSourceFingerprint: describeWorkflowConnectionGoals(
              dependencies.source(),
            ).sourceFingerprint,
            materialRepairs: [],
          }),
    };
  }
  function reserve(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): IncrementalConnectionUpdate {
    check(state, config);
    if (state.modelInvocations === undefined)
      throw new Error('Model reservation requires invocation accounting');
    const reservations =
      state.nextModelStage === 'material-replan'
        ? dependencies.materialRecovery?.modelInvocations
        : 1;
    if (reservations === undefined)
      throw new Error(
        'Originating-stage reservation requires materialRecovery.modelInvocations',
      );
    if (
      state.modelInvocations + reservations >
      dependencies.policy.maxModelInvocations
    )
      throw new IncrementalConnectionLimitError({
        kind: 'model-invocations',
        limit: dependencies.policy.maxModelInvocations,
        observed: state.modelInvocations,
      });
    return { modelInvocations: state.modelInvocations + reservations };
  }
  async function goals(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    return invokeModelStage(async () => {
      check(state, config);
      if (state.rejectedGoalProposals === undefined)
        throw new Error('Goal planning requires its rejection history');
      try {
        const current = source(state);
        const fingerprint =
          describeWorkflowConnectionGoals(current).sourceFingerprint;
        const session = await planWorkflowConnectionGoals({
          ...current,
          model: dependencies.model,
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
          signal: createIncrementalConnectionSignal({
            state,
            policy: dependencies.policy,
            config,
          }),
        });
        check(state, config);
        return stageInitialConnectionGoalCandidate(dependencies, session);
      } catch (error) {
        const rejection = createWorkflowConnectionGoalRejection({
          ...source(state),
          error,
        });
        if (rejection === undefined) throw error;
        check(state, config);
        return {
          rejectedGoalProposals: [...state.rejectedGoalProposals, rejection],
          nextModelStage:
            dependencies.materialRecovery !== undefined &&
            rejection.stage === 'contract-validation' &&
            rejection.constraints !== undefined &&
            rejection.constraints.conflicts.length > 0
              ? 'goal-recovery'
              : 'goals',
        };
      }
    });
  }
  async function propose(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    return invokeModelStage(async () => {
      check(state, config);
      if (!state.session || !state.rejectedProposals)
        throw new Error(
          'Connection proposal requires a session and rejection history',
        );
      let bundleId: string | undefined;
      if (dependencies.outlinePlanning !== undefined) {
        if (!state.outline)
          throw new Error(
            'Outline connection proposal requires its checked global outline',
          );
        const planning = describeWorkflowConnectionOutline({
          ...source(state),
          session: state.session,
          outline: state.outline,
        });
        bundleId = dependencies.outlinePlanning.selectBundle({
          ...planning,
          rejectedProposals: structuredClone(state.rejectedProposals),
        });
        if (!planning.outline.bundles.some((bundle) => bundle.id === bundleId))
          throw new Error(
            'outlinePlanning.selectBundle must return an actual bundle ID',
          );
      }
      const pending = await planWorkflowConnectionStep({
        ...source(state),
        session: state.session,
        model: dependencies.model,
        ...(bundleId === undefined
          ? {}
          : { outline: state.outline!, bundleId }),
        // Keep all rejections for budget accounting; only this material epoch is model feedback.
        rejectedProposals: state.rejectedProposals.filter(
          (item) =>
            item.expected.sourceFingerprint ===
            state.session!.sourceFingerprint,
        ),
        signal: createIncrementalConnectionSignal({
          state,
          policy: dependencies.policy,
          config,
        }),
      });
      check(state, config);
      return { pending, pendingBundleId: bundleId };
    });
  }
  function apply(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): IncrementalConnectionUpdate {
    check(state, config);
    if (!state.pending || !state.session || !state.rejectedProposals)
      throw new Error(
        'Connection application requires the reserved proposal and current session',
      );
    const { decision, expected } = state.pending;
    const current = describeWorkflowConnectionStep({
      ...source(state),
      session: state.session,
    }).expected;
    if (
      expected.sessionId !== current.sessionId ||
      expected.sourceFingerprint !== current.sourceFingerprint ||
      expected.revision !== current.revision
    )
      throw new Error(
        'Connection decision belongs to a stale session/source/revision',
      );
    if (decision.kind === 'request-native-material')
      return { status: 'needs-native-material' };
    if (decision.kind === 'require-user-decision')
      return { status: 'needs-user-decision' };
    if (
      dependencies.outlinePlanning !== undefined &&
      (!state.outline || !state.pendingBundleId)
    )
      throw new Error(
        'Outline application requires its saved outline and selected bundle ID',
      );
    const application = {
      ...source(state),
      session: state.session,
      expected,
      proposal: decision,
    };
    const result =
      dependencies.outlinePlanning === undefined
        ? applyWorkflowConnectionStep(application)
        : applyWorkflowConnectionOutlineStep({
            ...application,
            outline: state.outline!,
            bundleId: state.pendingBundleId!,
          });
    if (result.status === 'rejected')
      return {
        rejectedProposals: [
          ...state.rejectedProposals,
          { expected, proposal: decision, violations: result.violations },
        ],
        pending: undefined,
        ...(dependencies.revisionPlanning === undefined
          ? {}
          : { nextModelStage: 'revision' as const }),
      };
    return { session: result.session, pending: undefined };
  }
  async function publish(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    check(state, config);
    if (
      !state.session ||
      state.modelInvocations === undefined ||
      !state.rejectedProposals ||
      !state.status
    )
      throw new Error(
        'Connection progress requires a session, status and invocation accounting',
      );
    const description = describeWorkflowConnectionStep({
      ...source(state),
      session: state.session,
    });
    await dependencies.observe?.({
      phase: state.status,
      sessionId: state.session.id,
      revision: state.session.revision,
      sourceFingerprint: state.session.sourceFingerprint,
      nodeIds: description.context.nodes.map((node) => node.id),
      edges: structuredClone(state.session.edges),
      rootNodeIds: [...state.session.rootNodeIds],
      pendingNodeIds: description.inspection.pendingNodeIds,
      ready: description.inspection.ready,
      modelInvocations: state.modelInvocations,
      rejectedProposals: countIncrementalConnectionRejections(state),
    });
    return {};
  }
  function route(
    state: IncrementalConnectionState,
  ): 'propose' | 'finalize' | 'stop' | 'prepare-native' | 'publish-revision' {
    check(state);
    if (
      state.status === 'needs-native-material' &&
      dependencies.nativeAugmentation !== undefined
    )
      return 'prepare-native';
    if (
      state.status === 'needs-native-material' ||
      state.status === 'needs-user-decision'
    )
      return 'stop';
    if (!state.session)
      throw new Error('Connection completion inspection requires a session');
    if (
      dependencies.revisionPlanning !== undefined &&
      state.revisionPhase !== undefined &&
      state.revisionPhase !== 'adopted'
    )
      return 'publish-revision';
    if (state.nextModelStage === 'revision') return 'propose';
    if (
      dependencies.outlinePlanning !== undefined &&
      state.outline === undefined
    ) {
      if (state.nextModelStage !== 'outline')
        throw new Error(
          'Missing outline requires an explicit outline planning stage',
        );
      return 'propose';
    }
    return inspectWorkflowConnectionCompletion({
      ...source(state),
      session: state.session,
    }).ready
      ? 'finalize'
      : 'propose';
  }
  function finalize(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): IncrementalConnectionUpdate {
    check(state, config);
    if (!state.session)
      throw new Error('Connection finalization requires a session');
    return {
      plan: finalizeWorkflowConnectionSession({
        ...source(state),
        session: state.session,
      }),
      status: 'complete',
    };
  }
  return {
    ...createIncrementalRevisionStages(dependencies, {
      check,
      invokeModelStage,
    }),
    initialize,
    reserve,
    goals,
    propose,
    apply,
    publish,
    route,
    finalize,
    fail,
    ...createIncrementalNativeStages(dependencies, { check, invokeModelStage }),
    ...createIncrementalOutlineStages(dependencies, {
      check,
      invokeModelStage,
    }),
    ...createIncrementalGoalReviewStages(dependencies, {
      check,
      invokeModelStage,
    }),
    ...createIncrementalMaterialRecoveryStages(dependencies, {
      check,
      invokeModelStage,
    }),
    ...createMaterialArgumentStages(dependencies, { check, invokeModelStage }),
  };
}
