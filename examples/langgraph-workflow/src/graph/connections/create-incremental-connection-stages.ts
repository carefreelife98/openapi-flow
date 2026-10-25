import type { RunnableConfig } from '@langchain/core/runnables';
import { randomUUID } from 'node:crypto';
import {
  describeWorkflowConnectionStep,
  applyWorkflowConnectionStep,
  inspectWorkflowConnectionCompletion,
  finalizeWorkflowConnectionSession,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionGoals,
  planWorkflowConnectionStep,
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
} from './check-incremental-connection-budget.js';
import { resolveIncrementalConnectionSource } from './resolve-incremental-connection-source.js';
import { createIncrementalNativeStages } from './native/create-incremental-native-stages.js';

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
        nextModelStage: 'step',
        failureId: undefined,
      };
    }
    if (
      state.startedAt !== undefined ||
      state.modelInvocations !== undefined ||
      state.rejectedProposals !== undefined
    )
      throw new Error(
        'A fresh connection run must not contain previous accounting without its session',
      );
    return {
      startedAt: Date.now(),
      modelInvocations: 0,
      rejectedProposals: [],
      status: 'planning',
      nextModelStage: 'goals',
      additionalNativeNodes: [],
      materialExtensions: [],
    };
  }
  function reserve(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): IncrementalConnectionUpdate {
    check(state, config);
    if (state.modelInvocations === undefined)
      throw new Error('Model reservation requires invocation accounting');
    if (state.modelInvocations >= dependencies.policy.maxModelInvocations)
      throw new IncrementalConnectionLimitError({
        kind: 'model-invocations',
        limit: dependencies.policy.maxModelInvocations,
        observed: state.modelInvocations,
      });
    return { modelInvocations: state.modelInvocations + 1 };
  }
  async function goals(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    return invokeModelStage(async () => {
      check(state, config);
      const session = await planWorkflowConnectionGoals({
        ...source(state),
        model: dependencies.model,
        signal: createIncrementalConnectionSignal({
          state,
          policy: dependencies.policy,
          config,
        }),
      });
      check(state, config);
      return { session, nextModelStage: 'step' };
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
      const pending = await planWorkflowConnectionStep({
        ...source(state),
        session: state.session,
        model: dependencies.model,
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
      return { pending };
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
    const result = applyWorkflowConnectionStep({
      ...source(state),
      session: state.session,
      expected,
      proposal: decision,
    });
    if (result.status === 'rejected')
      return {
        rejectedProposals: [
          ...state.rejectedProposals,
          { expected, proposal: decision, violations: result.violations },
        ],
        pending: undefined,
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
      rejectedProposals: state.rejectedProposals.length,
    });
    return {};
  }
  function route(
    state: IncrementalConnectionState,
  ): 'propose' | 'finalize' | 'stop' | 'prepare-native' {
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
  };
}
