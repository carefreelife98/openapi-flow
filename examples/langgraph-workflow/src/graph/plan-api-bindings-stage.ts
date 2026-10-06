import { planApiBindings } from '@openapi-flow/langchain';
import type {
  ApiPreparationDependencies,
  WorkflowState,
  WorkflowUpdate,
} from '../types/workflow-graph.js';
import { createApiBindingMaterials } from './prepare-api-binding-materials.js';

export function createApiBindingsStage(
  dependencies: ApiPreparationDependencies,
) {
  return async function planBindings(
    state: WorkflowState,
  ): Promise<WorkflowUpdate> {
    const bindingPlan = await planApiBindings({
      scenario: state.scenario,
      model: dependencies.model,
      materials: createApiBindingMaterials(state),
    });
    if (bindingPlan.gaps.length)
      throw new Error(
        `API bindings need review: ${JSON.stringify(bindingPlan.gaps)}`,
      );
    await dependencies.reviewBindings?.(bindingPlan);
    return { bindingPlan, trace: [...state.trace, 'bindings'] };
  };
}
