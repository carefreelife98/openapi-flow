import { StateGraph, START, END } from '@langchain/langgraph';
import { planWorkflowGraph } from '@openapi-flow/langchain';
import {
  compilePlannedN8nWorkflow,
  createN8nNativeOutputSources,
} from '@openapi-flow/n8n';
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
import { createApiRequestMediaTypesStage } from './select-api-request-media-types-stage.js';
import { createApiBindingMaterials } from './prepare-api-binding-materials.js';

/** Automatic graph design; consumers may instead compose the package functions themselves. */
export function buildPlannedWorkflowGraph(
  dependencies: PlannedGraphDependencies,
) {
  const stages = createApiPreparationStages(dependencies);
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
      includeExplanations: dependencies.graphOptions?.includeExplanations,
      capabilities: dependencies.capabilities,
      preparedNativeNodes: dependencies.preparedNativeNodes,
      materials: createApiBindingMaterials(state).map(
        ({ operation, purpose }, index) => ({
          operation,
          purpose,
          arguments: state.arguments![index],
        }),
      ),
    });
    // This host example stops on gaps. Standalone planWorkflowGraph returns them for HITL.
    if (graphPlan.gaps.length)
      throw new Error(
        `Workflow needs review: ${JSON.stringify(graphPlan.gaps)}`,
      );
    await dependencies.reviewPlan?.(graphPlan);
    return { graphPlan, trace: [...state.trace, 'graph-plan'] };
  }
  function compileWorkflow(state: WorkflowState): WorkflowUpdate {
    if (
      !state.graphPlan ||
      !state.contracts ||
      !state.arguments ||
      state.contracts.length !== state.arguments.length
    )
      throw new Error(
        'compileWorkflow requires graphPlan and matching actual contracts/arguments',
      );
    const names = Object.fromEntries(
      state.arguments!.map((call) => [call.callId, 'Request ' + call.callId]),
    );
    const nativeOutputSources = createN8nNativeOutputSources({
      nativeNodes: state.graphPlan.nativeNodes,
      capabilities: dependencies.capabilities,
      apiNodeNames: names,
      apiResponseContracts: Object.fromEntries(
        state.contracts.map((operation, index) => [
          state.arguments![index].callId,
          operation,
        ]),
      ),
    });
    const requests = createRequestMaterials(
      state,
      dependencies,
      nativeOutputSources,
    );
    const result = compilePlannedN8nWorkflow({
      id: state.workflowId,
      name: state.workflowName,
      plan: state.graphPlan,
      capabilities: dependencies.capabilities,
      materials: requests.map(({ operation, arguments: args, purpose }) => ({
        operation,
        purpose,
        arguments: args,
      })),
      apiNodes: requests.map((item) => item.fragment),
    });
    return { ...result, trace: [...state.trace, 'compile'] };
  }
  return new StateGraph(workflowStateSchema)
    .addNode('buildCatalog', stages.buildCatalog)
    .addNode('selectOperations', stages.selectOperations)
    .addNode('resolveContracts', stages.resolveContracts)
    .addNode(
      'selectRequestMediaTypes',
      createApiRequestMediaTypesStage(dependencies),
    )
    .addNode('planBindings', createApiBindingsStage(dependencies))
    .addNode('generateArguments', stages.generateArguments)
    .addNode('planGraph', planGraph)
    .addNode('compileWorkflow', compileWorkflow)
    .addEdge(START, 'buildCatalog')
    .addEdge('buildCatalog', 'selectOperations')
    .addEdge('selectOperations', 'resolveContracts')
    .addEdge('resolveContracts', 'selectRequestMediaTypes')
    .addEdge('selectRequestMediaTypes', 'planBindings')
    .addEdge('planBindings', 'generateArguments')
    .addEdge('generateArguments', 'planGraph')
    .addEdge('planGraph', 'compileWorkflow')
    .addEdge('compileWorkflow', END)
    .compile();
}
