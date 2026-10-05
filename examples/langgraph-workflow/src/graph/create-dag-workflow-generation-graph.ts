import { StateGraph, START, END } from '@langchain/langgraph';
import {
  createApiCatalog,
  listApiOperations,
  resolveApiOperations,
} from '@openapi-flow/core';
import {
  selectApiOperations,
  generateApiArguments,
} from '@openapi-flow/langchain';
import { createHttpRequestNode, assembleN8nWorkflow } from '@openapi-flow/n8n';
import type {
  DagGraphDependencies,
  WorkflowState,
  WorkflowUpdate,
} from '../types/workflow-graph.js';
import { workflowStateSchema } from '../schemas/workflow-state-schema.js';

export function createDagWorkflowGenerationGraph(
  dependencies: DagGraphDependencies,
) {
  const deploymentIds = dependencies.deployments.map((item) => item.documentId);
  if (new Set(deploymentIds).size !== deploymentIds.length) {
    throw new Error('deployments contains duplicate documentId values');
  }

  async function buildCatalog(state: WorkflowState): Promise<WorkflowUpdate> {
    return {
      catalog: await createApiCatalog(state.sources),
      trace: [...state.trace, 'catalog'],
    };
  }

  async function selectOperations(
    state: WorkflowState,
  ): Promise<WorkflowUpdate> {
    if (!state.catalog) throw new Error('selectOperations requires catalog');
    const selection = await selectApiOperations({
      operations: listApiOperations(state.catalog),
      scenario: state.scenario,
      model: dependencies.model,
    });
    if (selection.gaps.length)
      throw new Error(
        `API selection needs review: ${JSON.stringify(selection.gaps)}`,
      );
    dependencies.reviewSelection(selection);
    return { selection, trace: [...state.trace, 'select'] };
  }

  async function resolveContracts(
    state: WorkflowState,
  ): Promise<WorkflowUpdate> {
    if (!state.catalog || !state.selection)
      throw new Error('resolveContracts requires catalog and selection');
    const contracts = await resolveApiOperations(
      state.catalog,
      state.selection.operations.map((operation) => operation.key),
    );
    return { contracts, trace: [...state.trace, 'resolve'] };
  }

  async function generateArguments(
    state: WorkflowState,
  ): Promise<WorkflowUpdate> {
    if (!state.contracts?.length)
      throw new Error('generateArguments requires a resolved contract');
    const calls: NonNullable<WorkflowState['arguments']> = [];
    for (const [index, operation] of state.contracts.entries()) {
      const args = await generateApiArguments({
        callId: `${state.workflowId}-request-${index + 1}`,
        operation,
        scenario: state.scenario,
        model: dependencies.model,
        bindings: [],
      });
      if (args.unresolvedInputs.length) {
        throw new Error(
          `Request inputs need user clarification: ${JSON.stringify(args.unresolvedInputs)}`,
        );
      }
      calls.push(args);
    }
    return { arguments: calls, trace: [...state.trace, 'arguments'] };
  }

  function compileWorkflow(state: WorkflowState): WorkflowUpdate {
    if (
      !state.contracts?.length ||
      !state.arguments ||
      state.contracts.length !== state.arguments.length
    )
      throw new Error('compileWorkflow requires contract and arguments');
    const requests = state.contracts.map((operation, index) => {
      const args = state.arguments![index];
      const deployment = dependencies.deployments.find(
        (item) => item.documentId === operation.key.documentId,
      );
      if (!deployment)
        throw new Error(
          `deployments is missing documentId ${operation.key.documentId}`,
        );
      const request = createHttpRequestNode({
        operation,
        arguments: args,
        baseUrl: deployment.baseUrl,
        credentialBindings: deployment.credentialBindings,
        position: [300, index * 200],
      });
      return { operation, arguments: args, fragment: request };
    });
    const topology = dependencies.composeDag(requests);
    for (const request of requests) {
      if (!topology.nodes.includes(request.fragment))
        throw new Error(
          `Host DAG omitted selected request ${request.arguments.callId}`,
        );
    }
    const result = assembleN8nWorkflow({
      id: state.workflowId,
      name: state.workflowName,
      ...topology,
    });
    return { workflow: result.workflow, trace: [...state.trace, 'compile'] };
  }

  return new StateGraph(workflowStateSchema)
    .addNode('buildCatalog', buildCatalog)
    .addNode('selectOperations', selectOperations)
    .addNode('resolveContracts', resolveContracts)
    .addNode('generateArguments', generateArguments)
    .addNode('compileWorkflow', compileWorkflow)
    .addEdge(START, 'buildCatalog')
    .addEdge('buildCatalog', 'selectOperations')
    .addEdge('selectOperations', 'resolveContracts')
    .addEdge('resolveContracts', 'generateArguments')
    .addEdge('generateArguments', 'compileWorkflow')
    .addEdge('compileWorkflow', END)
    .compile();
}
