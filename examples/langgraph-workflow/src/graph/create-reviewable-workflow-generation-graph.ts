import type { PlannedGraphDependencies } from '../types/workflow-graph.js';
import { StateGraph, START, END } from '@langchain/langgraph';
import { createReviewableWorkflowGraphPlan } from '@openapi-flow/core';
import { planReviewableWorkflowGraph } from '@openapi-flow/langchain';
import type { WorkflowState, WorkflowUpdate } from '../types/workflow-graph.js';
import { workflowStateSchema } from '../schemas/workflow-state-schema.js';
import { createApiPreparationStages } from './prepare-api-workflow.js';
import { prepareReviewableApiCalls } from './review/prepare-reviewable-api-calls.js';
import { compileReviewableWorkflowStage } from './review/compile-reviewable-workflow-stage.js';
import { createApiRequestMediaTypesStage } from './select-api-request-media-types-stage.js';

export function createReviewableWorkflowGenerationGraph(
  dependencies: PlannedGraphDependencies,
) {
  const stages = createApiPreparationStages(
    dependencies,
    async (state, selection) => {
      dependencies.reviewSelection?.(selection);
      return { selection, trace: [...state.trace, 'select'] };
    },
  );
  async function buildCatalog(state: WorkflowState): Promise<WorkflowUpdate> {
    if (
      state.workflow !== undefined ||
      state.status !== undefined ||
      state.diagnostics !== undefined ||
      state.reviewMaterials !== undefined ||
      state.requestMediaTypes !== undefined ||
      state.reviewPlan !== undefined
    )
      throw new Error(
        'reviewable generation input must not contain previously generated output; compose standalone functions for a review/resume loop',
      );
    return stages.buildCatalog(state);
  }
  async function planGraph(state: WorkflowState): Promise<WorkflowUpdate> {
    if (!state.reviewMaterials || !state.diagnostics)
      throw new Error('review planning requires materials and diagnostics');
    const context = {
      materials: state.reviewMaterials,
      gaps: state.diagnostics,
      capabilities: dependencies.capabilities,
    };
    const reviewPlan =
      state.reviewMaterials.length === 0
        ? createReviewableWorkflowGraphPlan({
            ...context,
            proposal: {
              nativeNodes: [],
              edges: [],
              additionalGaps: [],
              blockedCalls: [],
            },
          })
        : await planReviewableWorkflowGraph({
            ...context,
            scenario: state.scenario,
            model: dependencies.model,
          });
    await dependencies.reviewPlan?.(reviewPlan);
    return { reviewPlan, trace: [...state.trace, 'graph-plan'] };
  }
  return new StateGraph(workflowStateSchema)
    .addNode('buildCatalog', buildCatalog)
    .addNode('selectOperations', stages.selectOperations)
    .addNode('resolveContracts', stages.resolveContracts)
    .addNode(
      'selectRequestMediaTypes',
      createApiRequestMediaTypesStage(dependencies),
    )
    .addNode('prepareCalls', (state) =>
      prepareReviewableApiCalls(state, dependencies),
    )
    .addNode('planGraph', planGraph)
    .addNode('compileWorkflow', (state) =>
      compileReviewableWorkflowStage(state, dependencies),
    )
    .addEdge(START, 'buildCatalog')
    .addEdge('buildCatalog', 'selectOperations')
    .addEdge('selectOperations', 'resolveContracts')
    .addEdge('resolveContracts', 'selectRequestMediaTypes')
    .addEdge('selectRequestMediaTypes', 'prepareCalls')
    .addEdge('prepareCalls', 'planGraph')
    .addEdge('planGraph', 'compileWorkflow')
    .addEdge('compileWorkflow', END)
    .compile();
}
