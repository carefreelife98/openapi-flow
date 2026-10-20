import { planWorkflowConnections } from '@openapi-flow/langchain';
import type {
  PlannedGraphDependencies,
  WorkflowState,
  WorkflowUpdate,
} from '../types/workflow-graph.js';

export function createWorkflowConnectionPlanningStage(
  dependencies: PlannedGraphDependencies,
) {
  return async function connectWorkflowMaterials(
    state: WorkflowState,
  ): Promise<WorkflowUpdate> {
    if (!state.nativePlan || !state.reviewMaterials || !state.diagnostics)
      throw new Error(
        'connection planning requires native/API materials and diagnostics',
      );
    const reviewPlan = await planWorkflowConnections({
      scenario: state.scenario,
      model: dependencies.model,
      includeExplanations: dependencies.connectionOptions?.includeExplanations,
      materials: state.reviewMaterials,
      nativeNodes: state.nativePlan.nativeNodes,
      capabilities: dependencies.capabilities,
      gaps: [...state.diagnostics, ...state.nativePlan.gaps],
    });
    await dependencies.reviewPlan?.(reviewPlan);
    return { reviewPlan, trace: [...state.trace, 'connections'] };
  };
}
