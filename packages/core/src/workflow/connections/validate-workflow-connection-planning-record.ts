import { isDeepStrictEqual } from 'node:util';
import type { ValidateWorkflowConnectionPlanningRecordInput } from '../../types/workflow-connection-planning.js';
import { workflowConnectionPlanningRecordSchema } from '../../schemas/workflow-connection-planning-schema.js';
import { createWorkflowConnectionPlanningRecord } from './create-workflow-connection-planning-record.js';

export function validateWorkflowConnectionPlanningRecord(
  input: ValidateWorkflowConnectionPlanningRecordInput,
): void {
  const record = workflowConnectionPlanningRecordSchema.parse(input.record);
  const expected = createWorkflowConnectionPlanningRecord({
    ...input,
    decision: record.decision,
  });
  if (!isDeepStrictEqual(record, expected))
    throw new Error(
      'connection planning record differs from its original scenario, API/native sources, fixed edges, proposed plan or derived contracts',
    );
}
