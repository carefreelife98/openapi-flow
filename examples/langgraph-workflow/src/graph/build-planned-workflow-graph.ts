import type { WorkflowGapHandlers } from '../types/workflow-review.js';
import { StateGraph, START, END } from '@langchain/langgraph';
import { planWorkflowGraph } from '@openapi-flow/langchain';
import { compilePlannedN8nWorkflow } from '@openapi-flow/n8n';
import type {
  PlannedGraphDependencies,
  WorkflowState,
  WorkflowUpdate,
} from '../types/workflow-graph.js';
import { workflowStateSchema } from '../schemas/workflow-state-schema.js';
import {
  createApiPreparationStages,
  createRequestMaterials,
} from './prepare-api-workflow.js';
import { createApiBindingsStage } from './plan-api-bindings-stage.js';

/** Automatic graph design; consumers may instead compose the package functions themselves. */
export function buildPlannedWorkflowGraph(
  dependencies: PlannedGraphDependencies,
  reviewHandlers?: WorkflowGapHandlers,
) {
  const stages = createApiPreparationStages(
    dependencies,
    reviewHandlers?.selection,
  );
  async function buildCatalog(state: WorkflowState): Promise<WorkflowUpdate> {
    if (
      reviewHandlers &&
      (state.preview !== undefined || state.workflow !== undefined)
    )
      throw new Error(
        'reviewable generation input must not contain workflow or preview; compose standalone functions for a review/resume loop',
      );
    return stages.buildCatalog(state);
  }
  async function planGraph(state: WorkflowState): Promise<WorkflowUpdate> {
    if (
      !state.contracts?.length ||
      !state.arguments ||
      state.contracts.length !== state.arguments.length
    )
      throw new Error('planGraph requires resolved contracts and arguments');
    const graphPlan = await planWorkflowGraph({
      scenario: state.scenario,
      model: dependencies.model,
      capabilities: dependencies.capabilities,
      materials: state.contracts.map((operation, index) => ({
        operation,
        arguments: state.arguments![index],
      })),
    });
    if (graphPlan.gaps.length && reviewHandlers)
      return reviewHandlers.graph(state, graphPlan);
    // This host example stops on gaps. Standalone planWorkflowGraph returns them for HITL.
    if (graphPlan.gaps.length)
      throw new Error(
        `Workflow needs review: ${JSON.stringify(graphPlan.gaps)}`,
      );
    await dependencies.reviewPlan?.(graphPlan);
    return { graphPlan, trace: [...state.trace, 'graph-plan'] };
  }
  function compileWorkflow(state: WorkflowState): WorkflowUpdate {
    if (!state.graphPlan) throw new Error('compileWorkflow requires graphPlan');
    const requests = createRequestMaterials(state, dependencies);
    const result = compilePlannedN8nWorkflow({
      id: state.workflowId,
      name: state.workflowName,
      plan: state.graphPlan,
      capabilities: dependencies.capabilities,
      materials: requests.map(({ operation, arguments: args }) => ({
        operation,
        arguments: args,
      })),
      apiNodes: requests.map((item) => item.fragment),
    });
    return { workflow: result.workflow, trace: [...state.trace, 'compile'] };
  }
  return new StateGraph(workflowStateSchema)
    .addNode('buildCatalog', buildCatalog)
    .addNode('selectOperations', stages.selectOperations)
    .addNode('resolveContracts', stages.resolveContracts)
    .addNode(
      'planBindings',
      createApiBindingsStage(dependencies, reviewHandlers?.bindings),
    )
    .addNode('generateArguments', stages.generateArguments)
    .addNode('planGraph', planGraph)
    .addNode('compileWorkflow', compileWorkflow)
    .addEdge(START, 'buildCatalog')
    .addEdge('buildCatalog', 'selectOperations')
    .addConditionalEdges(
      'selectOperations',
      (state) => (reviewHandlers && state.preview ? END : 'resolveContracts'),
      [END, 'resolveContracts'],
    )
    .addEdge('resolveContracts', 'planBindings')
    .addConditionalEdges(
      'planBindings',
      (state) => (reviewHandlers && state.preview ? END : 'generateArguments'),
      [END, 'generateArguments'],
    )
    .addEdge('generateArguments', 'planGraph')
    .addConditionalEdges(
      'planGraph',
      (state) => (reviewHandlers && state.preview ? END : 'compileWorkflow'),
      [END, 'compileWorkflow'],
    )
    .addEdge('compileWorkflow', END)
    .compile();
}
