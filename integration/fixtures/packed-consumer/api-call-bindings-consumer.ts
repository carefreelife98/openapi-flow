import assert from 'node:assert/strict';
import {
  resolveApiBindingSourceSelection,
  resolveApiCallBindingPlan,
  validateApiCallBindingPlan,
  assembleApiBindingPlan,
} from '@openapi-flow/core';
import type {
  ApiBindingMaterial,
  ApiBindingPlan,
  ApiCallBindingPlan,
} from '@openapi-flow/core';
import {
  selectApiBindingSources,
  planApiCallBindings,
  planApiBindingsByCall,
} from '@openapi-flow/langchain';
import type {
  PlanApiBindingsByCallInput,
  SelectApiBindingSourcesInput,
} from '@openapi-flow/langchain';

export function verifyConsumerApiBindingAssembly(
  material: ApiBindingMaterial,
): ApiBindingPlan {
  const input = {
    scenario:
      'This request is independent; its literal inputs are planned later.',
    materials: [material],
    callId: material.callId,
  };
  const sources = resolveApiBindingSourceSelection({
    ...input,
    proposal: { sourceNodeIds: [], gaps: [] },
  });
  const result: ApiCallBindingPlan = resolveApiCallBindingPlan({
    ...input,
    sources,
    proposal: { bindings: [], gaps: [] },
  });
  validateApiCallBindingPlan({ ...input, result });
  const plan = assembleApiBindingPlan({ ...input, results: [result] });
  assert.deepEqual(plan.calls, [{ callId: material.callId, bindings: [] }]);
  return plan;
}

export async function verifyConsumerScopedBindingTypes(
  input: SelectApiBindingSourcesInput,
): Promise<ApiCallBindingPlan> {
  const sources = await selectApiBindingSources(input);
  return planApiCallBindings({ ...input, sources });
}

export function verifyConsumerBindingSchedulerTypes(
  input: PlanApiBindingsByCallInput,
): Promise<ApiBindingPlan> {
  return planApiBindingsByCall(input);
}
