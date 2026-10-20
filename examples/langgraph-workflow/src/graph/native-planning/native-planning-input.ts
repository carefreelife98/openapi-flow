import type { NativeInstanceSelectionInput } from '@openapi-flow/core';
import { n8nNativeInputConfigurationSchema } from '@openapi-flow/n8n';
import type { NativePlanningGraphDependencies } from '../../types/native-planning.js';
import type { WorkflowState } from '../../types/workflow-graph.js';
import { stagedNativePlanningOptionsSchema } from '../../schemas/native-planning-schema.js';
import { createApiBindingMaterials } from '../prepare-api-binding-materials.js';

export function validateNativePlanningConfiguration(
  input: NativePlanningGraphDependencies,
): void {
  if (input.nativePlanning !== undefined) {
    stagedNativePlanningOptionsSchema.parse(input.nativePlanning);
    if (!input.checkpointer)
      throw new Error(
        'Staged native planning requires an explicit host checkpointer',
      );
    if (
      input.nativePlanning.allowRuntimeParameters === true &&
      input.nativeInputs === undefined
    )
      throw new Error(
        'nativeInputs.revision is required when staged native planning enables runtime parameters',
      );
  }
  if (input.nativeInputs !== undefined)
    n8nNativeInputConfigurationSchema.parse(input.nativeInputs);
}

export function nativePlanningInput(
  state: WorkflowState,
  dependencies: NativePlanningGraphDependencies,
): NativeInstanceSelectionInput {
  if (!state.contracts)
    throw new Error('Staged native planning requires resolved API contracts');
  if (dependencies.nativePlanning?.mode !== 'staged')
    throw new Error('Staged native planning must be explicitly enabled');
  return {
    planId: `${state.workflowId}-native`,
    scenario: state.scenario,
    capabilities: dependencies.capabilities,
    preparedNativeNodes:
      dependencies.preparedNativeNodes === undefined
        ? []
        : structuredClone(dependencies.preparedNativeNodes),
    apiMaterials: state.contracts.length
      ? createApiBindingMaterials(state)
      : [],
    allowRuntimeParameters: dependencies.nativePlanning.allowRuntimeParameters,
    includeExplanations: dependencies.nativeOptions?.includeExplanations,
  };
}
