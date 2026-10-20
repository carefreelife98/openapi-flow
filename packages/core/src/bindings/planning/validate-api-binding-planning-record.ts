import { isDeepStrictEqual } from 'node:util';
import type { ValidateApiBindingPlanningRecordInput } from '../../types/api-binding-planning.js';
import { apiBindingPlanningRecordSchema } from '../../schemas/api-binding-planning-schema.js';
import { createApiBindingPlanningRecord } from './create-api-binding-planning-record.js';

/** Recheck against the original planning input and actual proposed plan, not later revisions. */
export function validateApiBindingPlanningRecord(
  input: ValidateApiBindingPlanningRecordInput,
): void {
  const record = apiBindingPlanningRecordSchema.parse(input.record);
  const expected = createApiBindingPlanningRecord({
    ...input,
    reasons: record.calls.map(({ callId, reason }) => ({ callId, reason })),
  });
  if (!isDeepStrictEqual(record, expected))
    throw new Error(
      'Binding planning record differs from its original scenario, roles, contracts, native sources or proposed plan',
    );
}
