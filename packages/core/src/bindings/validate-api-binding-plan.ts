import type { ValidateApiBindingPlanInput } from '../types/api-bindings.js';
import { validateApiBindingAssignments } from './validate-api-binding-assignments.js';

/** Check identities/contracts without guessing edges or substituting values. */
export function validateApiBindingPlan({
  plan,
  materials,
  nativeOutputs,
}: ValidateApiBindingPlanInput): void {
  if (plan.gaps.length)
    throw new Error(`API bindings need review: ${JSON.stringify(plan.gaps)}`);
  validateApiBindingAssignments({
    calls: plan.calls,
    materials,
    nativeOutputs,
  });
}
