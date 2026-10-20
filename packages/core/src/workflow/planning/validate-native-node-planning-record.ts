import { isDeepStrictEqual } from 'node:util';
import type { ValidateNativeNodePlanningRecordInput } from '../../types/native-node-planning.js';
import { nativeNodePlanningRecordSchema } from '../../schemas/native-node-planning-record-schema.js';
import { createNativeNodePlanningRecord } from './create-native-node-planning-record.js';

export function validateNativeNodePlanningRecord(
  input: ValidateNativeNodePlanningRecordInput,
): void {
  const record = nativeNodePlanningRecordSchema.parse(input.record);
  const expected = createNativeNodePlanningRecord({
    ...input,
    ...(record.kind === 'model-plan' ? { assessment: record.assessment } : {}),
  });
  if (!isDeepStrictEqual(record, expected))
    throw new Error(
      'Native planning record differs from the original scenario, prepared instances, implementation contracts or actual proposal',
    );
}
