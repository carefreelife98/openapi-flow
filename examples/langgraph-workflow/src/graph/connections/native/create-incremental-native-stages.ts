import { isDeepStrictEqual } from 'node:util';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  resolveNativeInstanceSelection,
  describeNativeInstanceDependencies,
  resolveNativeNodeParameters,
  extendWorkflowConnectionSession,
} from '@openapi-flow/core';
import {
  planNativeInstanceDependencies,
  generateNativeNodeParameters,
  NativeNodePlanningError,
} from '@openapi-flow/langchain';
import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionState,
  IncrementalConnectionUpdate,
  IncrementalNativeStageRuntime,
} from '../../../types/incremental-connections.js';
import { createIncrementalConnectionSignal } from '../check-incremental-connection-budget.js';
import { resolveIncrementalConnectionSource } from '../resolve-incremental-connection-source.js';
import { createIncrementalNativeInput } from './create-incremental-native-input.js';

export function createIncrementalNativeStages(
  dependencies: IncrementalConnectionDependencies,
  runtime: IncrementalNativeStageRuntime,
) {
  function prepareNative(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): IncrementalConnectionUpdate {
    runtime.check(state, config);
    const { input, request, expected } = createIncrementalNativeInput(
      dependencies,
      state,
    );
    if (!state.materialExtensions || !state.rejectedProposals)
      throw new Error(
        'Native material preparation requires extension and rejection ledgers',
      );
    if (
      state.materialExtensions.some(
        (entry) =>
          entry.request.capability === request.capability &&
          entry.request.purpose === request.purpose,
      )
    )
      return {
        status: 'planning',
        pending: undefined,
        nextModelStage: 'step',
        rejectedProposals: [
          ...state.rejectedProposals,
          {
            expected,
            proposal: request,
            violations: [
              {
                code: 'NO_PROGRESS',
                message:
                  'The same native instance role was already added; connect the existing material or request a distinct role.',
              },
            ],
          },
        ],
      };
    const policy = dependencies.nativeAugmentation;
    if (!policy)
      throw new Error('Automatic native augmentation policy is required');
    const selection = resolveNativeInstanceSelection({
      ...input,
      proposal: {
        instances: [
          {
            ...policy.parameterOwnership,
            capability: request.capability,
            purpose: request.purpose,
            ...(policy.includeExplanations ? { reason: request.reason } : {}),
          },
        ],
        gaps: [],
        ...(policy.includeExplanations ? { reason: request.reason } : {}),
      },
    });
    return {
      nativeSelection: selection,
      nativeDependencies: undefined,
      nativeConfiguration: undefined,
      nextModelStage: 'native-dependencies',
    };
  }
  function dependencyNeedsModel(state: IncrementalConnectionState): boolean {
    const { input } = createIncrementalNativeInput(dependencies, state);
    if (!state.nativeSelection)
      throw new Error(
        'Native dependency inspection requires the selected instance',
      );
    return Object.values(
      describeNativeInstanceDependencies({
        ...input,
        selection: state.nativeSelection,
      }).sourceCandidatesByNodeId,
    ).some((ids) => ids.length > 0);
  }
  async function nativeDependencies(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    return runtime.invokeModelStage(async () => {
      runtime.check(state, config);
      const { input } = createIncrementalNativeInput(dependencies, state);
      if (!state.nativeSelection)
        throw new Error('Native dependency planning requires selection');
      const nativeDependencies = await planNativeInstanceDependencies({
        ...input,
        selection: state.nativeSelection,
        ...(dependencyNeedsModel(state) ? { model: dependencies.model } : {}),
        signal: createIncrementalConnectionSignal({
          state,
          policy: dependencies.policy,
          config,
        }),
      });
      runtime.check(state, config);
      return { nativeDependencies, nextModelStage: 'native-parameters' };
    });
  }
  function parametersNeedModel(state: IncrementalConnectionState): boolean {
    const instance = state.nativeSelection?.instances[0];
    if (!instance)
      throw new Error(
        'Native parameter inspection requires one selected instance',
      );
    return instance.hasLiteralParameters;
  }
  async function nativeParameters(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): Promise<IncrementalConnectionUpdate> {
    return runtime.invokeModelStage(async () => {
      runtime.check(state, config);
      const { input } = createIncrementalNativeInput(dependencies, state);
      if (!state.nativeSelection || !state.nativeDependencies)
        throw new Error(
          'Native parameter planning requires selected instance and dependencies',
        );
      const instance = state.nativeSelection.instances[0];
      if (!instance)
        throw new Error(
          'Native parameter planning requires the code-selected instance',
        );
      const nativeConfiguration = await generateNativeNodeParameters({
        ...input,
        selection: state.nativeSelection,
        dependencies: state.nativeDependencies,
        nodeId: instance.id,
        ...(parametersNeedModel(state) ? { model: dependencies.model } : {}),
        signal: createIncrementalConnectionSignal({
          state,
          policy: dependencies.policy,
          config,
        }),
      });
      runtime.check(state, config);
      return { nativeConfiguration };
    });
  }
  function applyNative(
    state: IncrementalConnectionState,
    config?: RunnableConfig,
  ): IncrementalConnectionUpdate {
    runtime.check(state, config);
    const { input, request, expected } = createIncrementalNativeInput(
      dependencies,
      state,
    );
    if (
      !state.nativeSelection ||
      !state.nativeDependencies ||
      !state.nativeConfiguration ||
      !state.additionalNativeNodes ||
      !state.materialExtensions ||
      !state.session
    )
      throw new Error(
        'Native application requires complete configuration and material ledgers',
      );
    const instance = state.nativeSelection.instances[0];
    if (!instance)
      throw new Error('Native application requires the selected instance');
    const result = resolveNativeNodeParameters({
      ...input,
      selection: state.nativeSelection,
      dependencies: state.nativeDependencies,
      nodeId: instance.id,
      fingerprint: state.nativeConfiguration.fingerprint,
      proposal: state.nativeConfiguration.proposal,
    });
    if (!isDeepStrictEqual(result, state.nativeConfiguration))
      throw new Error(
        'Native configuration changed before material application',
      );
    if (result.status !== 'ready')
      throw new NativeNodePlanningError(
        { stage: 'parameter-validation', output: result },
        new Error(
          'Automatic native configuration is unresolved; no settings were invented and no technical question was sent to a user',
        ),
      );
    const extension = extendWorkflowConnectionSession({
      ...resolveIncrementalConnectionSource(dependencies, state),
      session: state.session,
      expected,
      additionalNativeNodes: [result.node],
    });
    return {
      session: extension.session,
      additionalNativeNodes: [...state.additionalNativeNodes, result.node],
      materialExtensions: [
        ...state.materialExtensions,
        {
          request,
          selection: state.nativeSelection,
          dependencies: state.nativeDependencies,
          result,
          extension: {
            previous: extension.previous,
            addedNativeNodeIds: extension.addedNativeNodeIds,
          },
        },
      ],
      nativeSelection: undefined,
      nativeDependencies: undefined,
      nativeConfiguration: undefined,
      pending: undefined,
      status: 'planning',
      nextModelStage: 'step',
    };
  }
  return {
    prepareNative,
    dependencyNeedsModel,
    nativeDependencies,
    parametersNeedModel,
    nativeParameters,
    applyNative,
  };
}
