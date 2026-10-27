import { isDeepStrictEqual } from 'node:util';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  selectNativeNodeInstances,
  generateNativeNodeParameters,
  planNativeInstanceDependencies,
} from '@openapi-flow/langchain';
import {
  assembleNativeNodeMaterials,
  createNativeNodePlan,
  resolveNativeNodeParameters,
  resolveNativeInstanceSelection,
  inspectNativeNodeConfigurationReadiness,
  validateNativeInstanceDependencies,
} from '@openapi-flow/core';
import type { NativePlanningGraphDependencies } from '../../types/native-planning.js';
import type {
  WorkflowState,
  WorkflowUpdate,
} from '../../types/workflow-graph.js';
import { nativePlanningInput } from './native-planning-input.js';
import { createNativeSelectionPlanningGraph } from '../create-native-selection-planning-graph.js';
import { NativeSelectionPlanningStoppedError } from './selection/native-selection-planning-errors.js';
import type { NativeSelectionPlanningReceipt } from '../../types/native-selection-planning.js';

/** Planning worklist order is not workflow execution order; only the later DAG owns edges. */
export function createStagedNativePlanningStages(
  dependencies: NativePlanningGraphDependencies,
) {
  const selectionGraph =
    dependencies.nativePlanning?.selectionReview === undefined
      ? undefined
      : createNativeSelectionPlanningGraph({
          ...dependencies.nativePlanning.selectionReview,
          capabilities: dependencies.capabilities,
          model: dependencies.model,
          now: Date.now,
        });
  async function select(
    state: WorkflowState,
    config?: RunnableConfig,
  ): Promise<WorkflowUpdate> {
    if (
      state.nativeSelection !== undefined ||
      state.nativeDependencies !== undefined ||
      state.nativeConfigurations !== undefined
    )
      throw new Error(
        'Staged native selection must not overwrite generated state',
      );
    const input = nativePlanningInput(state, dependencies);
    let planning: NativeSelectionPlanningReceipt | undefined;
    const selection =
      selectionGraph === undefined
        ? await selectNativeNodeInstances({
            ...input,
            model: dependencies.model,
            ...(config?.signal === undefined ? {} : { signal: config.signal }),
          })
        : await (async () => {
            const source = { ...input };
            // The child receives runtime functions from dependencies, never its checkpoint input.
            Reflect.deleteProperty(source, 'capabilities');
            const result = await selectionGraph.invoke({ source }, config);
            const selected = result.selections?.at(-1);
            if (
              !selected ||
              !result.status ||
              result.modelInvocations === undefined ||
              result.reselections === undefined ||
              !result.reviews
            )
              throw new Error(
                'Native selection planning ended without its original result and accounting',
              );
            planning = {
              status: result.status,
              modelInvocations: result.modelInvocations,
              reselections: result.reselections,
              reviews: result.reviews,
            };
            return selected;
          })();
    return {
      nativeSelection: selection,
      ...(planning === undefined ? {} : { nativeSelectionPlanning: planning }),
      nativeConfigurations: [],
      nativeReplyIssues: [],
      nativePlanningStatus:
        planning !== undefined && planning.status !== 'ready'
          ? 'selection-blocked'
          : 'working',
      trace: [...state.trace, 'native-select'],
    };
  }

  async function planDependencies(
    state: WorkflowState,
  ): Promise<WorkflowUpdate> {
    if (
      !state.nativeSelection ||
      state.nativeDependencies !== undefined ||
      state.nativeConfigurations?.length
    )
      throw new Error(
        'Native dependency planning requires original selection and no previous configuration or dependency plan',
      );
    if (dependencies.nativePlanning?.planDependencies !== true)
      throw new Error('Native dependency planning must be explicitly enabled');
    const nativeDependencies = await planNativeInstanceDependencies({
      ...nativePlanningInput(state, dependencies),
      model: dependencies.model,
      selection: state.nativeSelection,
    });
    return {
      nativeDependencies,
      trace: [...state.trace, 'native-dependencies'],
    };
  }

  function schedule(state: WorkflowState): WorkflowUpdate {
    if (!state.nativeSelection || !state.nativeConfigurations)
      throw new Error(
        'Native configuration scheduling requires selection and task storage',
      );
    if (
      dependencies.nativePlanning?.planDependencies === true &&
      !state.nativeDependencies
    )
      throw new Error(
        'Native scheduling requires the explicit producer dependency plan',
      );
    const tasks = state.nativeConfigurations;
    const unfinished = tasks.find((task) => task.result === undefined);
    if (unfinished)
      return {
        activeNativeNodeId: unfinished.nodeId,
        nativePlanningStatus: 'working',
      };
    const configuredNodes = tasks.flatMap((task) =>
      task.result?.status === 'ready' ? [task.result.node] : [],
    );
    const unattempted = state.nativeSelection.instances.filter(
      (instance) => !tasks.some((task) => task.nodeId === instance.id),
    );
    const readiness = unattempted.map((instance) =>
      inspectNativeNodeConfigurationReadiness({
        ...nativePlanningInput(state, dependencies),
        selection: state.nativeSelection!,
        nodeId: instance.id,
        configuredNodes,
        dependencies: state.nativeDependencies,
      }),
    );
    const next = unattempted.find((instance) =>
      readiness.some(
        (entry) => entry.nodeId === instance.id && entry.status === 'ready',
      ),
    );
    if (next) {
      return {
        nativeConfigurations: [
          ...state.nativeConfigurations,
          {
            nodeId: next.id,
            configuredNodes: structuredClone(configuredNodes),
            replies: [],
          },
        ],
        activeNativeNodeId: next.id,
        nativePlanningStatus: 'working',
      };
    }
    if (
      unattempted.length &&
      !tasks.some((task) => task.result?.status === 'needs-clarification')
    )
      throw new Error(
        'Selected native instances require unavailable completed material contracts: ' +
          JSON.stringify(readiness),
      );
    return {
      activeNativeNodeId: undefined,
      nativePlanningStatus: state.nativeConfigurations.some(
        (task) => task.result?.status === 'needs-clarification',
      )
        ? 'awaiting-input'
        : 'ready',
    };
  }

  async function generate(state: WorkflowState): Promise<WorkflowUpdate> {
    if (
      !state.nativeSelection ||
      !state.nativeConfigurations ||
      !state.activeNativeNodeId
    )
      throw new Error(
        'Native value generation requires an active selected task',
      );
    const task = state.nativeConfigurations.find(
      (task) => task.nodeId === state.activeNativeNodeId,
    );
    if (!task || task.result !== undefined)
      throw new Error('Native value task is missing or already completed');
    const result = await generateNativeNodeParameters({
      ...nativePlanningInput(state, dependencies),
      model: dependencies.model,
      selection: state.nativeSelection,
      nodeId: task.nodeId,
      configuredNodes: task.configuredNodes,
      replies: task.replies,
      dependencies: state.nativeDependencies,
    });
    return {
      nativeConfigurations: state.nativeConfigurations.map((entry) =>
        entry.nodeId === task.nodeId ? { ...entry, result } : entry,
      ),
      activeNativeNodeId: undefined,
      trace: [...state.trace, 'native-values:' + task.nodeId],
    };
  }

  function finalize(state: WorkflowState): WorkflowUpdate {
    if (
      !state.nativeSelection ||
      !state.nativeConfigurations ||
      state.nativePlanningStatus !== 'ready'
    )
      throw new Error(
        'Native plan assembly requires all selected settings to be ready',
      );
    const input = nativePlanningInput(state, dependencies);
    const current = resolveNativeInstanceSelection({
      ...input,
      proposal: state.nativeSelection.proposal,
    });
    if (!isDeepStrictEqual(current, state.nativeSelection))
      throw new Error('Native selection changed before final assembly');
    if (
      dependencies.nativePlanning?.planDependencies === true &&
      !state.nativeDependencies
    )
      throw new Error(
        'Native assembly requires the explicit producer dependency plan',
      );
    if (state.nativeDependencies !== undefined)
      validateNativeInstanceDependencies({
        ...input,
        selection: current,
        dependencies: state.nativeDependencies,
      });
    const selected = current.instances.map((instance) => instance.id).sort();
    if (
      !isDeepStrictEqual(
        selected,
        state.nativeConfigurations.map((task) => task.nodeId).sort(),
      )
    )
      throw new Error(
        'Native configuration tasks must exactly match the selected instances',
      );
    const nodes = state.nativeConfigurations.map((task) => {
      if (task.result?.status !== 'ready')
        throw new Error('Native settings are unresolved for ' + task.nodeId);
      const verified = resolveNativeNodeParameters({
        ...input,
        selection: current,
        nodeId: task.nodeId,
        configuredNodes: task.configuredNodes,
        replies: task.replies,
        dependencies: state.nativeDependencies,
        fingerprint: task.result.fingerprint,
        proposal: task.result.proposal,
      });
      if (
        verified.status !== 'ready' ||
        !isDeepStrictEqual(verified, task.result)
      )
        throw new Error(
          'Native configuration result was changed for ' + task.nodeId,
        );
      return verified.node;
    });
    const proposal = createNativeNodePlan({
      ...input,
      proposal: { nativeNodes: nodes, gaps: current.proposal.gaps },
    });
    return {
      nativePlan: {
        proposal,
        nativeNodes: assembleNativeNodeMaterials(
          input.preparedNativeNodes === undefined
            ? []
            : input.preparedNativeNodes,
          proposal.nativeNodes,
        ),
        gaps: proposal.gaps,
      },
      trace: [...state.trace, 'native-plan'],
    };
  }
  function stopSelection(state: WorkflowState): never {
    if (
      !state.nativeSelection ||
      !state.nativeSelectionPlanning ||
      state.nativePlanningStatus !== 'selection-blocked'
    )
      throw new Error(
        'Native selection stop requires its preserved selection and review receipt',
      );
    throw new NativeSelectionPlanningStoppedError({
      selection: state.nativeSelection,
      receipt: state.nativeSelectionPlanning,
    });
  }
  return {
    select,
    planDependencies,
    schedule,
    generate,
    finalize,
    stopSelection,
  };
}

export function routeNativeConfiguration(
  state: WorkflowState,
):
  'generateNativeParameters' | 'askNativeConfiguration' | 'finalizeNativePlan' {
  if (state.activeNativeNodeId !== undefined) return 'generateNativeParameters';
  if (state.nativePlanningStatus === 'awaiting-input')
    return 'askNativeConfiguration';
  if (state.nativePlanningStatus === 'ready') return 'finalizeNativePlan';
  throw new Error('Native configuration scheduler returned no explicit action');
}
