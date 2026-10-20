import { resolveN8nNativeMaterials } from '@openapi-flow/n8n';
import type {
  PlannedGraphDependencies,
  WorkflowState,
} from '../../types/workflow-graph.js';
import { createApiBindingMaterials } from '../prepare-api-binding-materials.js';

/** Reconstruct implementations from current real contracts; never put executable factories in checkpoints. */
export function resolveWorkflowNativeDependencies<
  T extends PlannedGraphDependencies,
>(state: WorkflowState, dependencies: T): T {
  if (!state.nativePlan || !state.contracts)
    throw new Error(
      'Native material binding requires a completed native plan and resolved API contracts',
    );
  const resolved = resolveN8nNativeMaterials({
    apiMaterials: state.contracts.length
      ? createApiBindingMaterials(state)
      : [],
    nativeOutputs: [],
    nativeNodes: state.nativePlan.nativeNodes,
    capabilities: dependencies.capabilities,
  });
  return { ...dependencies, capabilities: resolved.capabilities };
}
