import { analyzeApiRequestMediaType } from '@openapi-flow/langchain';
import type {
  ApiPreparationDependencies,
  ResolvedApiRequestMediaType,
  WorkflowState,
  WorkflowUpdate,
} from '../types/workflow-graph.js';
import { createSelectedApiCallMaterials } from './create-selected-api-call-materials.js';

export function createApiRequestMediaTypesStage(
  dependencies: ApiPreparationDependencies,
) {
  return async function selectRequestMediaTypes(
    state: WorkflowState,
  ): Promise<WorkflowUpdate> {
    if (!state.contracts)
      throw new Error('selectRequestMediaTypes requires resolved contracts');
    const requestMediaTypes: ResolvedApiRequestMediaType[] = [];
    for (const { callId, operation, purpose } of createSelectedApiCallMaterials(
      state,
    )) {
      const decision = await analyzeApiRequestMediaType({
        operation,
        scenario: state.scenario,
        purpose,
        model: dependencies.model,
        includeExplanations:
          dependencies.requestMediaOptions?.includeExplanations,
      });
      const { requestMediaType } = decision;
      requestMediaTypes.push({
        callId,
        decision,
        ...(requestMediaType === undefined ? {} : { requestMediaType }),
      });
    }
    return { requestMediaTypes, trace: [...state.trace, 'request-media'] };
  };
}
