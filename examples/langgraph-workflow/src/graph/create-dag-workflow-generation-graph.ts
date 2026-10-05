import { StateGraph, START, END } from '@langchain/langgraph';
import { assembleN8nWorkflow } from '@openapi-flow/n8n';
import type {
  DagGraphDependencies,
  WorkflowState,
  WorkflowUpdate,
} from '../types/workflow-graph.js';
import { workflowStateSchema } from '../schemas/workflow-state-schema.js';
import {
  createApiPreparationStages,
  createRequestMaterials,
} from './prepare-api-workflow.js';

export function createDagWorkflowGenerationGraph(
  dependencies: DagGraphDependencies,
) {
  const stages = createApiPreparationStages(dependencies);
  function compileWorkflow(state: WorkflowState): WorkflowUpdate {
    const requests = createRequestMaterials(state, dependencies);
    const topology = dependencies.composeDag(requests);
    for (const request of requests)
      if (!topology.nodes.includes(request.fragment))
        throw new Error(
          `Host DAG omitted selected request ${request.arguments.callId}`,
        );
    const result = assembleN8nWorkflow({
      id: state.workflowId,
      name: state.workflowName,
      ...topology,
    });
    return { workflow: result.workflow, trace: [...state.trace, 'compile'] };
  }
  return new StateGraph(workflowStateSchema)
    .addNode('buildCatalog', stages.buildCatalog)
    .addNode('selectOperations', stages.selectOperations)
    .addNode('resolveContracts', stages.resolveContracts)
    .addNode('generateArguments', stages.generateArguments)
    .addNode('compileWorkflow', compileWorkflow)
    .addEdge(START, 'buildCatalog')
    .addEdge('buildCatalog', 'selectOperations')
    .addEdge('selectOperations', 'resolveContracts')
    .addEdge('resolveContracts', 'generateArguments')
    .addEdge('generateArguments', 'compileWorkflow')
    .addEdge('compileWorkflow', END)
    .compile();
}
