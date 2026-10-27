import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  describeNativeInstanceSelection,
  validateNativeInstanceSelection,
  validateNativeInstanceSelectionReview,
} from '@openapi-flow/core';
import {
  selectNativeNodeInstances,
  reviewNativeInstanceSelection,
} from '@openapi-flow/langchain';
import type {
  NativeSelectionPlanningDependencies,
  NativeSelectionPlanningState,
  NativeSelectionPlanningUpdate,
  NativeSelectionPlanningSnapshot,
} from '../../../types/native-selection-planning.js';
import { NativeSelectionPlanningLimitError } from './native-selection-planning-errors.js';

/** Private runtime failures never enter checkpoints. Keep this graph runtime for failure-only resume. */
export function createNativeSelectionPlanningStages(
  dependencies: NativeSelectionPlanningDependencies,
) {
  const failures = new Map<string, unknown>();
  function source(state: NativeSelectionPlanningState) {
    if (!state.source)
      throw new Error('Native selection planning.source is required');
    if (Object.hasOwn(state.source, 'capabilities'))
      throw new Error(
        'Native selection planning.source must not contain runtime capabilities',
      );
    return { ...state.source, capabilities: dependencies.capabilities };
  }
  function snapshot(
    state: NativeSelectionPlanningState,
  ): NativeSelectionPlanningSnapshot {
    const input = source(state);
    return {
      source: structuredClone(state.source!),
      context: describeNativeInstanceSelection(input).context,
    };
  }
  function assertSource(state: NativeSelectionPlanningState): void {
    if (
      !state.snapshot ||
      !state.policy ||
      !isDeepStrictEqual(state.snapshot, snapshot(state)) ||
      !isDeepStrictEqual(state.policy, dependencies.policy)
    )
      throw new Error(
        'Native selection planning source or policy changed; start a new run',
      );
    if (
      !state.selections ||
      !state.reviews ||
      state.startedAt === undefined ||
      state.modelInvocations === undefined ||
      state.reselections === undefined ||
      !state.status ||
      !state.nextAction
    )
      throw new Error(
        'Native selection checkpoint requires its original counters, stage and ledgers',
      );
    const input = source(state);
    for (const selection of state.selections)
      validateNativeInstanceSelection({ ...input, selection });
    for (const review of state.reviews) {
      const selection = state.selections.find(
        (entry) => entry.id === review.selectionId,
      );
      if (!selection)
        throw new Error('Native review checkpoint has no original selection');
      validateNativeInstanceSelectionReview({ ...input, selection, review });
    }
    if (
      state.modelInvocations <
        state.reviews.length +
          (state.snapshot.context.capabilities.length
            ? state.selections.length
            : 0) ||
      state.reselections < Math.max(0, state.selections.length - 1)
    )
      throw new Error(
        'Native selection checkpoint cannot discard consumed reservations',
      );
    const last = state.selections.at(-1);
    if (state.status === 'ready' && (!last || last.gaps.length))
      throw new Error(
        'Ready native selection checkpoint requires its gap-free original selection',
      );
    if (
      state.status === 'unavailable-native-behavior' ||
      state.status === 'needs-business-decision'
    ) {
      const review = state.reviews.at(-1);
      if (
        !last ||
        !review ||
        review.selectionId !== last.id ||
        review.status !== state.status
      )
        throw new Error(
          'Blocked native selection checkpoint requires its matching original review',
        );
    }
  }
  function check(
    state: NativeSelectionPlanningState,
    config?: RunnableConfig,
  ): number {
    assertSource(state);
    config?.signal?.throwIfAborted();
    const now = dependencies.now();
    if (!Number.isSafeInteger(now) || now < state.startedAt!)
      throw new Error(
        'Native selection planning clock is invalid or moved backwards',
      );
    const elapsed = now - state.startedAt!;
    if (elapsed >= dependencies.policy.deadlineMs)
      throw new NativeSelectionPlanningLimitError({
        kind: 'deadline',
        limit: dependencies.policy.deadlineMs,
        observed: elapsed,
      });
    return dependencies.policy.deadlineMs - elapsed;
  }
  function signal(
    state: NativeSelectionPlanningState,
    config?: RunnableConfig,
  ): AbortSignal {
    const deadline = AbortSignal.timeout(check(state, config));
    return config?.signal
      ? AbortSignal.any([config.signal, deadline])
      : deadline;
  }
  async function invoke(
    execute: () => Promise<NativeSelectionPlanningUpdate>,
  ): Promise<NativeSelectionPlanningUpdate> {
    try {
      return await execute();
    } catch (error) {
      const id = randomUUID();
      failures.set(id, error);
      return { failureId: id };
    }
  }
  return {
    initialize(
      state: NativeSelectionPlanningState,
    ): NativeSelectionPlanningUpdate {
      if (state.snapshot) {
        assertSource(state);
        return {};
      }
      if (
        Object.entries(state).some(
          ([key, value]) => key !== 'source' && value !== undefined,
        )
      )
        throw new Error(
          'Fresh native selection planning must not contain generated state',
        );
      const startedAt = dependencies.now();
      if (!Number.isSafeInteger(startedAt) || startedAt < 0)
        throw new Error(
          'Native selection planning.now must return a nonnegative safe integer',
        );
      const original = snapshot(state);
      return {
        source: structuredClone(original.source),
        snapshot: original,
        policy: structuredClone(dependencies.policy),
        startedAt,
        modelInvocations: 0,
        reselections: 0,
        selections: [],
        reviews: [],
        status: 'planning',
        nextAction: 'select',
      };
    },
    reserve(
      state: NativeSelectionPlanningState,
      config?: RunnableConfig,
    ): NativeSelectionPlanningUpdate {
      check(state, config);
      if (state.status !== 'planning')
        throw new Error(
          'A terminal native selection run cannot reserve a new model call',
        );
      const reselection =
        state.nextAction === 'select' && state.selections!.length > 0;
      if (
        reselection &&
        state.reselections! >= dependencies.policy.maxReselections
      )
        throw new NativeSelectionPlanningLimitError({
          kind: 'reselections',
          limit: dependencies.policy.maxReselections,
          observed: state.reselections!,
        });
      const needsModel =
        state.nextAction === 'review' ||
        state.snapshot!.context.capabilities.length > 0;
      if (
        needsModel &&
        state.modelInvocations! >= dependencies.policy.maxModelInvocations
      )
        throw new NativeSelectionPlanningLimitError({
          kind: 'model-invocations',
          limit: dependencies.policy.maxModelInvocations,
          observed: state.modelInvocations!,
        });
      return {
        modelInvocations: state.modelInvocations! + (needsModel ? 1 : 0),
        reselections: state.reselections! + (reselection ? 1 : 0),
      };
    },
    async select(
      state: NativeSelectionPlanningState,
      config?: RunnableConfig,
    ): Promise<NativeSelectionPlanningUpdate> {
      return invoke(async () => {
        check(state, config);
        const previous = state.selections!.at(-1);
        const review = previous
          ? state.reviews!.findLast((item) => item.selectionId === previous.id)
          : undefined;
        if (previous && !review)
          throw new Error(
            'Native reselection requires the original matching gap review',
          );
        const selection = await selectNativeNodeInstances({
          ...source(state),
          model: dependencies.model,
          signal: signal(state, config),
          ...(previous
            ? {
                feedback: {
                  selection: previous,
                  review: review!,
                  previousSelections: state.selections!,
                },
              }
            : {}),
        });
        check(state, config);
        const repeated = state.selections!.some(
          (item) => item.id === selection.id,
        );
        if (
          repeated &&
          !state.reviews!.some(
            (item) =>
              item.selectionId === selection.id &&
              item.status === 'needs-reselection',
          )
        )
          throw new Error(
            'Repeated native selection requires its preserved reselection review',
          );
        const status = selection.gaps.length
          ? ('planning' as const)
          : ('ready' as const);
        return {
          selections: [...state.selections!, selection],
          status,
          nextAction: repeated ? 'select' : 'review',
          progress: {
            phase:
              status === 'ready'
                ? 'ready'
                : repeated
                  ? 'repeated-selection'
                  : 'selected',
            modelInvocations: state.modelInvocations!,
            reselections: state.reselections!,
            reportedGaps: selection.gaps.length,
          },
        };
      });
    },
    async review(
      state: NativeSelectionPlanningState,
      config?: RunnableConfig,
    ): Promise<NativeSelectionPlanningUpdate> {
      return invoke(async () => {
        check(state, config);
        const selection = state.selections!.at(-1);
        if (!selection || !selection.gaps.length)
          throw new Error('Native gap review requires a reported original gap');
        const review = await reviewNativeInstanceSelection({
          ...source(state),
          selection,
          model: dependencies.model,
          signal: signal(state, config),
        });
        check(state, config);
        const status =
          review.status === 'needs-reselection'
            ? ('planning' as const)
            : review.status === 'no-gaps'
              ? ('ready' as const)
              : review.status;
        return {
          reviews: [...state.reviews!, review],
          status,
          nextAction: 'select',
          progress: {
            phase: status === 'planning' ? 'reviewed' : 'blocked',
            modelInvocations: state.modelInvocations!,
            reselections: state.reselections!,
            reportedGaps: selection.gaps.length,
            reviewStatus: review.status,
          },
        };
      });
    },
    async publish(
      state: NativeSelectionPlanningState,
      config?: RunnableConfig,
    ): Promise<NativeSelectionPlanningUpdate> {
      return invoke(async () => {
        check(state, config);
        if (!state.progress)
          throw new Error(
            'Native selection progress is missing its completed stage summary',
          );
        await dependencies.observe?.(structuredClone(state.progress));
        check(state, config);
        return {};
      });
    },
    fail(state: NativeSelectionPlanningState): never {
      if (!state.failureId || !failures.has(state.failureId))
        throw new Error(
          'Original native selection failure is unavailable in this runtime',
        );
      throw failures.get(state.failureId);
    },
  };
}
