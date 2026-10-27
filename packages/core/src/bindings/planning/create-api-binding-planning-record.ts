import type {
  ApiBindingPlanningRecord,
  CreateApiBindingPlanningRecordInput,
} from '../../types/api-binding-planning.js';
import {
  apiBindingCallReasonsSchema,
  apiBindingPlanningRecordSchema,
} from '../../schemas/api-binding-planning-schema.js';
import { describeApiBindingPlanning } from './describe-api-binding-planning.js';
import { validateApiBindingAssignments } from '../validate-api-binding-assignments.js';
import { validateApiBindingGaps } from '../validate-api-binding-gaps.js';

/** Reasons belong to exact call decisions; gap descriptions already state their reasons. */
export function createApiBindingPlanningRecord(
  input: CreateApiBindingPlanningRecordInput,
): ApiBindingPlanningRecord {
  const { input: snapshot, context } = describeApiBindingPlanning(input);
  validateApiBindingAssignments({ ...snapshot, calls: input.plan.calls });
  validateApiBindingGaps({ ...snapshot, plan: input.plan });
  const reasons = apiBindingCallReasonsSchema.parse(input.reasons);
  const byId = new Map(reasons.map((item) => [item.callId, item.reason]));
  if (
    reasons.length !== input.plan.calls.length ||
    byId.size !== reasons.length ||
    input.plan.calls.some((call) => !byId.has(call.callId))
  )
    throw new Error(
      'binding planning reasons must name every planned callId exactly once',
    );
  return apiBindingPlanningRecordSchema.parse({
    kind: 'proposed-bindings',
    calls: input.plan.calls.map((call) => ({
      callId: call.callId,
      bindings: structuredClone(call.bindings),
      ...(byId.get(call.callId) === undefined
        ? {}
        : { reason: byId.get(call.callId)! }),
    })),
    gaps: structuredClone(input.plan.gaps),
    evidence: { kind: 'supplied-binding-contracts', context },
  });
}
