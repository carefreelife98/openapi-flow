import { planApiBindings } from '@openapi-flow/langchain';
import { createNativeOutputContracts } from '@openapi-flow/core';
import type {
  PlannedGraphDependencies,
  WorkflowState,
  WorkflowUpdate,
} from '../types/workflow-graph.js';
import { createApiBindingMaterials } from './prepare-api-binding-materials.js';

export function createApiBindingsStage(dependencies: PlannedGraphDependencies) {
  return async function planBindings(
    state: WorkflowState,
  ): Promise<WorkflowUpdate> {
    const bindingPlan = await planApiBindings({
      scenario: state.scenario,
      model: dependencies.model,
      materials: createApiBindingMaterials(state),
      nativeOutputs: createNativeOutputContracts({
        nativeNodes: dependencies.preparedNativeNodes ?? [],
        capabilities: dependencies.capabilities,
      }),
    });
    if (bindingPlan.gaps.length)
      throw new Error(
        `API bindings need review: ${JSON.stringify(bindingPlan.gaps)}`,
      );
    await dependencies.reviewBindings?.(bindingPlan);
    return { bindingPlan, trace: [...state.trace, 'bindings'] };
  };
}
