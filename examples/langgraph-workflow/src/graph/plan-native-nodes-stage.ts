import { planNativeNodes } from '@openapi-flow/langchain';
import type {
  PlannedGraphDependencies,
  WorkflowState,
  WorkflowUpdate,
} from '../types/workflow-graph.js';
import { createApiBindingMaterials } from './prepare-api-binding-materials.js';

export function createNativeNodePlanningStage(
  dependencies: PlannedGraphDependencies,
) {
  return async function planNativeInstances(
    state: WorkflowState,
  ): Promise<WorkflowUpdate> {
    if (!state.contracts)
      throw new Error('native planning requires resolved API contracts');
    const proposed = await planNativeNodes({
      planId: `${state.workflowId}-native`,
      scenario: state.scenario,
      model: dependencies.model,
      capabilities: dependencies.capabilities,
      preparedNativeNodes: dependencies.preparedNativeNodes,
      apiMaterials: state.contracts.length
        ? createApiBindingMaterials(state)
        : [],
    });
    return {
      nativePlan: {
        ...proposed,
        nativeNodes: [
          ...(dependencies.preparedNativeNodes ?? []),
          ...proposed.nativeNodes,
        ],
      },
      trace: [...state.trace, 'native-plan'],
    };
  };
}
