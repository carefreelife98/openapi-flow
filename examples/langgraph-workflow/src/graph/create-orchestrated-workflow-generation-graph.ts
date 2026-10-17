import { StateGraph, START, END } from '@langchain/langgraph';
import type {
  PlannedGraphDependencies,
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
  const planNatives = createNativeNodePlanningStage(dependencies);
  async function prepareCalls(state: WorkflowState): Promise<WorkflowUpdate> {
    if (!state.nativePlan) throw new Error('API binding requires native plan');
    return prepareReviewableApiCalls(state, {
      ...dependencies,
      preparedNativeNodes: state.nativePlan.nativeNodes,
    });
  }
  const connectNodes = createWorkflowConnectionPlanningStage(dependencies);
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
