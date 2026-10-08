import { StateGraph, START, END } from '@langchain/langgraph';
import {
  planNativeNodes,
  planWorkflowConnections,
} from '@openapi-flow/langchain';
import type {
  PlannedGraphDependencies,
  OrchestratedGraphDependencies,
  WorkflowState,
  WorkflowUpdate,
} from '../types/workflow-graph.js';
import { workflowStateSchema } from '../schemas/workflow-state-schema.js';
import { createApiPreparationStages } from './prepare-api-workflow.js';
import { createApiBindingMaterials } from './prepare-api-binding-materials.js';
import { createApiRequestMediaTypesStage } from './select-api-request-media-types-stage.js';
import { prepareReviewableApiCalls } from './review/prepare-reviewable-api-calls.js';
import { compileReviewableWorkflowStage } from './review/compile-reviewable-workflow-stage.js';

/** Host-owned composition. Native contracts exist before API bindings are planned. */
export function createOrchestratedWorkflowGenerationGraph(
  input: OrchestratedGraphDependencies,
) {
  const dependencies: PlannedGraphDependencies = {
    ...input,
    capabilities: input.capabilities ?? [],
  };
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
      state.reviewPlan !== undefined
    )
      throw new Error(
        'orchestrated generation input must not contain generated output; compose standalone functions for resume',
      );
    return stages.buildCatalog(state);
  }
  async function planNatives(state: WorkflowState): Promise<WorkflowUpdate> {
    if (!state.contracts)
      throw new Error('native planning requires resolved API contracts');
    const proposed = await planNativeNodes({
      planId: `${state.workflowId}-native`,
      scenario: state.scenario,
      model: dependencies.model,
      capabilities: dependencies.capabilities,
      preparedNativeNodes: dependencies.preparedNativeNodes,
      apiMaterials: state.contracts.length
        ? createApiBindingMaterials(state)
        : [],
    });
    return {
      nativePlan: {
        ...proposed,
        nativeNodes: [
          ...(dependencies.preparedNativeNodes ?? []),
          ...proposed.nativeNodes,
        ],
      },
      trace: [...state.trace, 'native-plan'],
    };
  }
  async function prepareCalls(state: WorkflowState): Promise<WorkflowUpdate> {
    if (!state.nativePlan) throw new Error('API binding requires native plan');
    return prepareReviewableApiCalls(state, {
      ...dependencies,
      preparedNativeNodes: state.nativePlan.nativeNodes,
    });
  }
  async function connectNodes(state: WorkflowState): Promise<WorkflowUpdate> {
    if (!state.nativePlan || !state.reviewMaterials || !state.diagnostics)
      throw new Error(
        'connection planning requires native/API materials and diagnostics',
      );
    const reviewPlan = await planWorkflowConnections({
      scenario: state.scenario,
      model: dependencies.model,
      materials: state.reviewMaterials,
      nativeNodes: state.nativePlan.nativeNodes,
      capabilities: dependencies.capabilities,
      gaps: [...state.diagnostics, ...state.nativePlan.gaps],
    });
    await dependencies.reviewPlan?.(reviewPlan);
    return { reviewPlan, trace: [...state.trace, 'connections'] };
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
    .addNode('prepareCalls', prepareCalls)
    .addNode('connectNodes', connectNodes)
    .addNode('compileWorkflow', (state) =>
      compileReviewableWorkflowStage(state, dependencies),
    )
    .addEdge(START, 'buildCatalog')
    .addEdge('buildCatalog', 'selectOperations')
    .addEdge('selectOperations', 'resolveContracts')
    .addEdge('resolveContracts', 'selectRequestMediaTypes')
    .addEdge('selectRequestMediaTypes', 'planNativeNodes')
    .addEdge('planNativeNodes', 'prepareCalls')
    .addEdge('prepareCalls', 'connectNodes')
    .addEdge('connectNodes', 'compileWorkflow')
    .addEdge('compileWorkflow', END)
    .compile();
}
