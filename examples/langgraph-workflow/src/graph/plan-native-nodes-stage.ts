import { planNativeNodes } from '@openapi-flow/langchain';
import { assembleNativeNodeMaterials } from '@openapi-flow/core';
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
    const prepared =
      dependencies.preparedNativeNodes === undefined
        ? []
        : structuredClone(dependencies.preparedNativeNodes);
    const proposed = await planNativeNodes({
      planId: `${state.workflowId}-native`,
      scenario: state.scenario,
      model: dependencies.model,
      includeExplanations: dependencies.nativeOptions?.includeExplanations,
      capabilities: dependencies.capabilities,
      preparedNativeNodes: prepared,
      apiMaterials: state.contracts.length
        ? createApiBindingMaterials(state)
        : [],
    });
    return {
      nativePlan: {
        proposal: proposed,
        nativeNodes: assembleNativeNodeMaterials(
          prepared,
          structuredClone(proposed.nativeNodes),
        ),
        gaps: structuredClone(proposed.gaps),
      },
      trace: [...state.trace, 'native-plan'],
    };
  };
}
