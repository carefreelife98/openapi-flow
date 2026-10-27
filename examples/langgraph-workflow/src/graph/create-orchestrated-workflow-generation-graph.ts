import { StateGraph, START, END } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import type {
  OrchestratedGraphDependencies,
  WorkflowState,
  WorkflowUpdate,
} from '../types/workflow-graph.js';
import { workflowStateSchema } from '../schemas/workflow-state-schema.js';
import { createApiPreparationStages } from './prepare-api-workflow.js';
import { createApiRequestMediaTypesStage } from './select-api-request-media-types-stage.js';
import { prepareReviewableApiCalls } from './review/prepare-reviewable-api-calls.js';
import { compileReviewableWorkflowStage } from './review/compile-reviewable-workflow-stage.js';
import { createNativeNodePlanningStage } from './plan-native-nodes-stage.js';
import { createWorkflowConnectionPlanningStage } from './plan-workflow-connections-stage.js';
import type { NativePlanningGraphDependencies } from '../types/native-planning.js';
import { validateNativePlanningConfiguration } from './native-planning/native-planning-input.js';
import {
  createStagedNativePlanningStages,
  routeNativeConfiguration,
} from './native-planning/create-staged-native-planning-stages.js';
import { askNativeConfiguration } from './native-planning/ask-native-configuration.js';
import { resolveWorkflowNativeDependencies } from './native-planning/resolve-workflow-native-dependencies.js';

/** Host-owned composition. Native contracts exist before API bindings are planned. */
export function createOrchestratedWorkflowGenerationGraph(
  input: OrchestratedGraphDependencies,
) {
  const dependencies: NativePlanningGraphDependencies = {
    ...input,
    capabilities: input.capabilities ?? [],
  };
  validateNativePlanningConfiguration(dependencies);
  const stages = createApiPreparationStages(
    dependencies,
    async (state, selection) => {
      dependencies.reviewSelection?.(selection);
      return { selection, trace: [...state.trace, 'select'] };
    },
  );
  async function buildCatalog(state: WorkflowState): Promise<WorkflowUpdate> {
    if (
      state.nativePlan !== undefined ||
      state.workflow !== undefined ||
      state.reviewPlan !== undefined ||
      state.nativeSelection !== undefined ||
      state.nativeSelectionPlanning !== undefined ||
      state.nativeDependencies !== undefined ||
      state.nativeConfigurations !== undefined ||
      state.nativePlanningStatus !== undefined ||
      state.nativeInputTemplate !== undefined
    )
      throw new Error(
        'orchestrated generation input must not contain generated output; compose standalone functions for resume',
      );
    return stages.buildCatalog(state);
  }
  const planNatives = createNativeNodePlanningStage(dependencies);
  const nativeStages = createStagedNativePlanningStages(dependencies);
  async function prepareCalls(
    state: WorkflowState,
    config?: RunnableConfig,
  ): Promise<WorkflowUpdate> {
    if (!state.nativePlan) throw new Error('API binding requires native plan');
    return prepareReviewableApiCalls(
      state,
      {
        ...(dependencies.nativePlanning?.mode === 'staged'
          ? resolveWorkflowNativeDependencies(state, dependencies)
          : dependencies),
        preparedNativeNodes: state.nativePlan.nativeNodes,
      },
      config,
    );
  }
  async function connectNodes(state: WorkflowState): Promise<WorkflowUpdate> {
    return createWorkflowConnectionPlanningStage(
      dependencies.nativePlanning?.mode === 'staged'
        ? resolveWorkflowNativeDependencies(state, dependencies)
        : dependencies,
    )(state);
  }
  return new StateGraph(workflowStateSchema)
    .addNode('buildCatalog', buildCatalog)
    .addNode('selectOperations', stages.selectOperations)
    .addNode('resolveContracts', stages.resolveContracts)
    .addNode(
      'selectRequestMediaTypes',
      createApiRequestMediaTypesStage(dependencies),
    )
    .addNode('planNativeNodes', planNatives)
    .addNode('selectNativeInstances', nativeStages.select)
    .addNode('stopNativeSelectionPlanning', nativeStages.stopSelection)
    .addNode('planNativeDependencies', nativeStages.planDependencies)
    .addNode('scheduleNativeConfiguration', nativeStages.schedule)
    .addNode('generateNativeParameters', nativeStages.generate)
    .addNode('askNativeConfiguration', askNativeConfiguration)
    .addNode('finalizeNativePlan', nativeStages.finalize)
    .addNode('prepareCalls', prepareCalls)
    .addNode('connectNodes', connectNodes)
    .addNode('compileWorkflow', (state) =>
      compileReviewableWorkflowStage(
        state,
        dependencies.nativePlanning?.mode === 'staged'
          ? resolveWorkflowNativeDependencies(state, dependencies)
          : dependencies,
        dependencies.nativeInputs,
      ),
    )
    .addEdge(START, 'buildCatalog')
    .addEdge('buildCatalog', 'selectOperations')
    .addEdge('selectOperations', 'resolveContracts')
    .addEdge('resolveContracts', 'selectRequestMediaTypes')
    .addConditionalEdges('selectRequestMediaTypes', () =>
      dependencies.nativePlanning?.mode === 'staged'
        ? 'selectNativeInstances'
        : 'planNativeNodes',
    )
    .addEdge('planNativeNodes', 'prepareCalls')
    .addConditionalEdges(
      'selectNativeInstances',
      (state) =>
        state.nativePlanningStatus === 'selection-blocked'
          ? 'stopNativeSelectionPlanning'
          : dependencies.nativePlanning?.planDependencies === true
            ? 'planNativeDependencies'
            : 'scheduleNativeConfiguration',
      [
        'stopNativeSelectionPlanning',
        'planNativeDependencies',
        'scheduleNativeConfiguration',
      ],
    )
    .addEdge('stopNativeSelectionPlanning', END)
    .addEdge('planNativeDependencies', 'scheduleNativeConfiguration')
    .addConditionalEdges(
      'scheduleNativeConfiguration',
      routeNativeConfiguration,
    )
    .addEdge('generateNativeParameters', 'scheduleNativeConfiguration')
    .addConditionalEdges('askNativeConfiguration', (state) =>
      state.nativePlanningStatus === 'cancelled'
        ? END
        : 'scheduleNativeConfiguration',
    )
    .addEdge('finalizeNativePlan', 'prepareCalls')
    .addEdge('prepareCalls', 'connectNodes')
    .addEdge('connectNodes', 'compileWorkflow')
    .addEdge('compileWorkflow', END)
    .compile({ checkpointer: input.checkpointer });
}
