import { isDeepStrictEqual } from 'node:util';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  describeWorkflowConnectionRevision,
  describeWorkflowConnectionGoals,
  validateWorkflowConnectionMaterialRepairReceipt,
  validateWorkflowConnectionSourceRepairRequest,
  validateWorkflowConnectionRevision,
  validateWorkflowConnectionGoalReview,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionRevision,
  createWorkflowConnectionRevisionRejection,
  reviewWorkflowConnectionGoals,
} from '@openapi-flow/langchain';
import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionState,
  IncrementalConnectionUpdate,
  IncrementalConnectionStageRuntime,
} from '../../types/incremental-connections.js';
import type { IncrementalAcceptedRevisionEvent } from '../../types/incremental-revisions.js';
import { describeIncrementalConnectionRevision } from './describe-incremental-connection-revision.js';
import { resolveIncrementalConnectionSource } from './resolve-incremental-connection-source.js';
import {
  createIncrementalConnectionSignal,
  countIncrementalConnectionRejections,
} from './check-incremental-connection-budget.js';

/** Host-owned revision scheduling. The current accepted session is untouched until adoption. */
export function createIncrementalRevisionStages(
  dependencies: IncrementalConnectionDependencies,
  runtime: IncrementalConnectionStageRuntime,
) {
  async function revise(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    return runtime.invokeModelStage(async () => {
      runtime.check(state, config);
      if (
        !dependencies.revisionPlanning ||
        !state.rejectedRevisions ||
        !state.rejectedProposals ||
        !state.rejectedRevisionReviews
      )
        throw new Error(
          'Revision planning requires its explicit model and rejection histories',
        );
      const input = describeIncrementalConnectionRevision(dependencies, state);
      const current = describeWorkflowConnectionRevision(input);
      try {
        const result = await planWorkflowConnectionRevision({
          ...input,
          model: dependencies.revisionPlanning.model,
          signal: createIncrementalConnectionSignal({
            state,
            policy: dependencies.policy,
            config,
          }),
          rejectedConnections: state.rejectedProposals.filter((item) =>
            isDeepStrictEqual(item.expected, current.before.expected),
          ),
          rejectedProposals: state.rejectedRevisions.filter(
            (item) => item.sourceFingerprint === current.sourceFingerprint,
          ),
          rejectedGoalReviews: state.rejectedRevisionReviews.filter(
            (item) =>
              isDeepStrictEqual(
                item.revision.previous,
                current.before.expected,
              ) &&
              item.review.sourceFingerprint ===
                describeWorkflowConnectionGoals({
                  ...input.after,
                  ...item.revision.sourceUpdate,
                }).sourceFingerprint,
          ),
        });
        runtime.check(state, config);
        const latest = describeIncrementalConnectionRevision(
          dependencies,
          state,
        );
        if (
          !isDeepStrictEqual(
            describeWorkflowConnectionRevision(latest),
            current,
          )
        )
          throw new Error(
            'Accepted revision input changed after model completion',
          );
        if (result.kind === 'replan-materials') {
          if (!dependencies.materialRecovery)
            throw new Error(
              'Revision requested an originating material stage but materialRecovery.replan is not configured',
            );
          validateWorkflowConnectionMaterialRepairReceipt({
            ...latest,
            receipt: result,
          });
          const request = {
            kind: 'replan-materials' as const,
            sourceFingerprint: current.after.sourceFingerprint,
            request: result.request,
          };
          validateWorkflowConnectionSourceRepairRequest({
            source: latest.after,
            request,
          });
          return {
            pendingRevisionMaterialRequest: result,
            pendingMaterialRepair: request,
            recoveryPhase: 'requested',
            nextModelStage: 'material-replan',
            revisionPhase: 'requested',
            pendingRevision: undefined,
            pendingRevisionReview: undefined,
          };
        }
        return {
          pendingRevision: result.revision,
          pendingRevisionReview: undefined,
          revisionPhase: 'candidate',
          nextModelStage: dependencies.initialGoalReview
            ? 'revision-review'
            : 'step',
        };
      } catch (error) {
        const rejection = createWorkflowConnectionRevisionRejection({
          ...describeIncrementalConnectionRevision(dependencies, state),
          error,
        });
        if (!rejection) throw error;
        runtime.check(state, config);
        return {
          rejectedRevisions: [...state.rejectedRevisions, rejection],
          nextModelStage: 'revision',
          revisionPhase: 'rejected',
        };
      }
    });
  }
  async function reviewRevision(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    return runtime.invokeModelStage(async () => {
      runtime.check(state, config);
      if (
        !dependencies.initialGoalReview ||
        !state.pendingRevision ||
        !state.rejectedRevisionReviews
      )
        throw new Error(
          'Revised goal review requires its configured model, candidate and rejection history',
        );
      const input = describeIncrementalConnectionRevision(dependencies, state);
      const revision = state.pendingRevision;
      validateWorkflowConnectionRevision({
        ...input,
        proposal: revision.proposal,
        revision,
      });
      const review = await reviewWorkflowConnectionGoals({
        ...input.after,
        ...revision.sourceUpdate,
        session: revision.session,
        model: dependencies.initialGoalReview.model,
        signal: createIncrementalConnectionSignal({
          state,
          policy: dependencies.policy,
          config,
        }),
      });
      runtime.check(state, config);
      validateWorkflowConnectionRevision({
        ...describeIncrementalConnectionRevision(dependencies, state),
        proposal: revision.proposal,
        revision,
      });
      return review.accepted
        ? { pendingRevisionReview: review, revisionPhase: 'reviewed' }
        : {
            rejectedRevisionReviews: [
              ...state.rejectedRevisionReviews,
              { revision, review },
            ],
            pendingRevision: undefined,
            pendingRevisionReview: undefined,
            nextModelStage: 'revision',
            revisionPhase: 'rejected',
          };
    });
  }
  function adoptRevision(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): IncrementalConnectionUpdate {
    runtime.check(state, config);
    if (
      !state.session ||
      !state.sourceEvents ||
      !state.pendingRevision ||
      !state.pendingRevisionRepairs
    )
      throw new Error(
        'Revision adoption requires its accepted base, candidate and ordered source ledger',
      );
    const input = describeIncrementalConnectionRevision(dependencies, state);
    const revision = state.pendingRevision;
    validateWorkflowConnectionRevision({
      ...input,
      proposal: revision.proposal,
      revision,
    });
    if (dependencies.initialGoalReview && !state.pendingRevisionReview)
      throw new Error(
        'Revision adoption requires the configured independent goal review',
      );
    if (state.pendingRevisionReview) {
      validateWorkflowConnectionGoalReview({
        ...input.after,
        ...revision.sourceUpdate,
        session: revision.session,
        review: state.pendingRevisionReview,
      });
      if (!state.pendingRevisionReview.accepted)
        throw new Error('Rejected goal review cannot be adopted');
    }
    const event: IncrementalAcceptedRevisionEvent = {
      kind: 'accepted-revision',
      beforeSession: state.session,
      repairs: state.pendingRevisionRepairs,
      revision,
      ...(state.pendingRevisionReview === undefined
        ? {}
        : { review: state.pendingRevisionReview }),
    };
    const sourceEvents = [...state.sourceEvents, event];
    const update: IncrementalConnectionUpdate = {
      session: revision.session,
      sourceEvents,
      pendingRevisionRepairs: [],
      pendingMaterialRepair: undefined,
      pendingRevisionMaterialRequest: undefined,
      pending: undefined,
      pendingBundleId: undefined,
      outline: undefined,
      status: 'planning',
      nextModelStage: dependencies.outlinePlanning ? 'outline' : 'step',
      revisionPhase: 'adopted',
    };
    resolveIncrementalConnectionSource(dependencies, {
      ...state,
      session: revision.session,
      sourceEvents,
    });
    return update;
  }
  async function publishRevision(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    runtime.check(state, config);
    if (
      !dependencies.revisionPlanning ||
      !state.session ||
      !state.revisionPhase ||
      state.modelInvocations === undefined
    )
      throw new Error(
        'Revision progress requires its explicit policy, current session, phase and accounting',
      );
    await dependencies.revisionPlanning.observe?.({
      phase: state.revisionPhase,
      sessionId: state.session.id,
      modelInvocations: state.modelInvocations,
      rejectedProposals: countIncrementalConnectionRejections(state),
      ...(state.pendingRevision === undefined
        ? {}
        : { impact: structuredClone(state.pendingRevision.impact) }),
    });
    return state.revisionPhase === 'adopted'
      ? { pendingRevision: undefined, pendingRevisionReview: undefined }
      : {};
  }
  return { revise, reviewRevision, adoptRevision, publishRevision };
}
