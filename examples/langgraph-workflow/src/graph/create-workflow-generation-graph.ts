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
  GraphDependencies,
  WorkflowState,
  WorkflowUpdate,
} from '../types/workflow-graph.js';
import { workflowStateSchema } from '../schemas/workflow-state-schema.js';

export function createWorkflowGenerationGraph(dependencies: GraphDependencies) {
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
    // This teaching composition has no multi-call DAG planner. Do not infer edges.
    if (selection.operations.length !== 1) {
      throw new Error(
        'Single-call example requires exactly one selected API; multi-call scenarios need an explicit host-owned DAG',
      );
    }
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
    const operation = state.contracts?.[0];
    if (!operation)
      throw new Error('generateArguments requires a resolved contract');
    const args = await generateApiArguments({
      callId: `${state.workflowId}-request`,
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
    return { arguments: [args], trace: [...state.trace, 'arguments'] };
  }

  function compileWorkflow(state: WorkflowState): WorkflowUpdate {
    const operation = state.contracts?.[0];
    const args = state.arguments?.[0];
    if (!operation || !args)
      throw new Error('compileWorkflow requires contract and arguments');
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
      position: [300, 0],
    });
    const result = assembleN8nWorkflow({
      id: state.workflowId,
      name: state.workflowName,
      nodes: [request],
      edges: [],
      starts: [request.nodeId],
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
