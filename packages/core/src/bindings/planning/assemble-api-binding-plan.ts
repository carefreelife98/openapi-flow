import type { AssembleApiBindingPlanInput } from '../../types/api-call-binding-planning.js';
import type { ApiBindingPlan } from '../../types/api-bindings.js';
import { validateApiCallBindingPlan } from './validate-api-call-binding-plan.js';
import { validateApiBindingAssignments } from '../validate-api-binding-assignments.js';
import { validateApiBindingGaps } from '../validate-api-binding-gaps.js';
import { createApiBindingPlanningRecord } from './create-api-binding-planning-record.js';

/** Only a complete set of real call results can become a whole binding plan. */
export function assembleApiBindingPlan(
  input: AssembleApiBindingPlanInput,
): ApiBindingPlan {
  if (!Array.isArray(input.materials) || !Array.isArray(input.results))
    throw new Error('binding materials and results must be arrays');
  if (!input.materials.length) {
    if (input.results.length)
      throw new Error('binding results exist without any API material');
    return { calls: [], gaps: [] };
  }
  for (const result of input.results)
    validateApiCallBindingPlan({ ...input, callId: result.callId, result });
  const plan: ApiBindingPlan = {
    calls: input.results.map(({ callId, bindings }) => ({
      callId,
      bindings: structuredClone(bindings),
    })),
    gaps: input.results.flatMap((result) => structuredClone(result.gaps)),
  };
  validateApiBindingAssignments({ ...input, calls: plan.calls });
  validateApiBindingGaps({ ...input, plan });
  // Planning order never defines execution order. Preserve supplied material identity order only.
  const byId = new Map(plan.calls.map((call) => [call.callId, call]));
  plan.calls = input.materials.map((material) => byId.get(material.callId)!);
  if (input.includeExplanations === true) {
    const byCall = new Map(
      input.results.map((result) => [result.callId, result]),
    );
    plan.callPlanning = input.materials.map((material) =>
      structuredClone(byCall.get(material.callId)!),
    );
    plan.bindingPlanning = createApiBindingPlanningRecord({
      ...input,
      plan,
      reasons: input.results.map((result) => ({
        callId: result.callId,
        ...(result.reason === undefined ? {} : { reason: result.reason }),
      })),
    });
  }
  return plan;
}
