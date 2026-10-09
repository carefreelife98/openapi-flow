import {
  createApiCatalog,
  listApiOperations,
  resolveApiOperations,
} from '@openapi-flow/core';
import {
  selectApiOperations,
  generateApiArguments,
} from '@openapi-flow/langchain';
import { createHttpRequestNode } from '@openapi-flow/n8n';
import type { N8nNativeOutputSource } from '@openapi-flow/n8n';
import type {
  ApiPreparationDependencies,
  WorkflowState,
  WorkflowUpdate,
  ResolvedRequestNode,
} from '../types/workflow-graph.js';
import { createApiBindingMaterials } from './prepare-api-binding-materials.js';
import { deploymentsSchema } from '../schemas/configuration-schema.js';
import type { SelectionGapHandler } from '../types/workflow-review.js';

export function createApiPreparationStages(
  dependencies: ApiPreparationDependencies,
  onSelectionGaps?: SelectionGapHandler,
) {
  const deployments =
    dependencies.deployments === undefined
      ? []
      : deploymentsSchema.parse(dependencies.deployments);
  const ids = deployments.map((item) => item.documentId);
  if (new Set(ids).size !== ids.length)
    throw new Error('deployments contains duplicate documentId values');
  return {
    async buildCatalog(state: WorkflowState): Promise<WorkflowUpdate> {
      for (const id of ids)
        if (!state.sources.some((source) => source.id === id))
          throw new Error(
            `deployments.documentId ${id} does not match an OAS source`,
          );
      return {
        catalog: await createApiCatalog(state.sources),
        trace: [...state.trace, 'catalog'],
      };
    },
    async selectOperations(state: WorkflowState): Promise<WorkflowUpdate> {
      if (!state.catalog) throw new Error('selectOperations requires catalog');
      const selection = await selectApiOperations({
        operations: listApiOperations(state.catalog),
        scenario: state.scenario,
        model: dependencies.model,
      });
      if (selection.gaps.length && onSelectionGaps)
        return onSelectionGaps(state, selection);
      if (selection.gaps.length)
        throw new Error(
          `API selection needs review: ${JSON.stringify(selection.gaps)}`,
        );
      dependencies.reviewSelection?.(selection);
      return { selection, trace: [...state.trace, 'select'] };
    },
    async resolveContracts(state: WorkflowState): Promise<WorkflowUpdate> {
      if (!state.catalog || !state.selection)
        throw new Error('resolveContracts requires catalog and selection');
      return {
        contracts: await resolveApiOperations(
          state.catalog,
          state.selection.operations.map((item) => item.key),
        ),
        trace: [...state.trace, 'resolve'],
      };
    },
    async generateArguments(state: WorkflowState): Promise<WorkflowUpdate> {
      if (!state.contracts?.length)
        throw new Error('generateArguments requires a resolved contract');
      const calls: NonNullable<WorkflowState['arguments']> = [];
      for (const {
        callId,
        operation,
        requestMediaType,
      } of createApiBindingMaterials(state)) {
        const boundCall = state.bindingPlan?.calls.find(
          (call) => call.callId === callId,
        );
        if (state.bindingPlan && !boundCall)
          throw new Error(`bindingPlan is missing ${callId}`);
        const args = await generateApiArguments({
          callId,
          operation,
          requestMediaType,
          scenario: state.scenario,
          model: dependencies.model,
          bindings: boundCall ? boundCall.bindings : [],
        });
        if (args.unresolvedInputs.length)
          throw new Error(
            `Request inputs need user clarification: ${JSON.stringify(args.unresolvedInputs)}`,
          );
        calls.push(args);
      }
      return { arguments: calls, trace: [...state.trace, 'arguments'] };
    },
  };
}

export function createRequestMaterials(
  state: WorkflowState,
  dependencies: ApiPreparationDependencies,
  nativeOutputSources: N8nNativeOutputSource[] = [],
): ResolvedRequestNode[] {
  if (
    !state.contracts?.length ||
    !state.arguments ||
    state.contracts.length !== state.arguments.length
  )
    throw new Error('compileWorkflow requires contract and arguments');
  return state.contracts.map((operation, index) => {
    const args = state.arguments![index];
    const deployment = dependencies.deployments?.find(
      (item) => item.documentId === operation.key.documentId,
    );
    return {
      operation,
      arguments: args,
      fragment: createHttpRequestNode({
        operation,
        arguments: args,
        nativeOutputSources,
        ...(dependencies.linkedItemCallIds?.includes(args.callId)
          ? { itemMode: 'linked' as const }
          : {}),
        apiResponseContracts: Object.fromEntries(
          state.arguments!.map((call, sourceIndex) => [
            call.callId,
            state.contracts![sourceIndex],
          ]),
        ),
        baseUrl: deployment?.baseUrl,
        credentialBindings: deployment?.credentialBindings,
        securityRequirementIndex: deployment?.securityRequirementIndex,
        apiNodeNames: Object.fromEntries(
          state.arguments!.map((call) => [
            call.callId,
            'Request ' + call.callId,
          ]),
        ),
        position: [300, index * 200],
      }),
    };
  });
}
