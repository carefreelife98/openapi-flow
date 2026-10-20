import { isDeepStrictEqual } from 'node:util';
import type { ValidateWorkflowGraphPlanningRecordInput } from '../../types/workflow-graph-planning.js';
import { workflowGraphPlanningRecordSchema } from '../../schemas/workflow-graph-planning-schema.js';
import { createWorkflowGraphPlanningRecord } from './create-workflow-graph-planning-record.js';

export function validateWorkflowGraphPlanningRecord(
  input: ValidateWorkflowGraphPlanningRecordInput,
): void {
  const record = workflowGraphPlanningRecordSchema.parse(input.record);
  const expected = createWorkflowGraphPlanningRecord({
    ...input,
    proposal: record.proposal,
    assessment: record.assessment,
  });
  if (!isDeepStrictEqual(record, expected))
    throw new Error(
      'graph planning record differs from its original scenario, supplied materials, proposal, plan or verification',
    );
}
