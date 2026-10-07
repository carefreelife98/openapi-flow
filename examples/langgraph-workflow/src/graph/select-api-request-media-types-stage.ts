import { selectApiRequestMediaType } from '@openapi-flow/langchain';
import type {
  ApiPreparationDependencies,
  ResolvedApiRequestMediaType,
  WorkflowState,
  WorkflowUpdate,
} from '../types/workflow-graph.js';

export function createApiRequestMediaTypesStage(
  dependencies: ApiPreparationDependencies,
) {
  return async function selectRequestMediaTypes(
    state: WorkflowState,
  ): Promise<WorkflowUpdate> {
    if (!state.contracts)
      throw new Error('selectRequestMediaTypes requires resolved contracts');
    const requestMediaTypes: ResolvedApiRequestMediaType[] = [];
    for (const [index, operation] of state.contracts.entries()) {
      const requestMediaType = await selectApiRequestMediaType({
        operation,
        scenario: state.scenario,
        model: dependencies.model,
      });
      requestMediaTypes.push({
        callId: `${state.workflowId}-request-${index + 1}`,
        ...(requestMediaType === undefined ? {} : { requestMediaType }),
      });
    }
    return { requestMediaTypes, trace: [...state.trace, 'request-media'] };
  };
}
