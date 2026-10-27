import { z } from 'zod';
import {
  workflowConnectionStepExpectationSchema,
  workflowConnectionRevisionViolationsSchema,
  workflowPlanningConstraintInspectionSchema,
} from '@openapi-flow/core';

const source = {
  sourceFingerprint:
    workflowConnectionStepExpectationSchema.shape.sourceFingerprint,
  expected: workflowConnectionStepExpectationSchema,
  output: z.json(),
  reason: z.string().min(1),
};

/** Private feedback for the exact two source epochs and original session, not user input or browser data. */
export const workflowConnectionRevisionRejectionSchema = z.discriminatedUnion(
  'stage',
  [
    z.strictObject({
      ...source,
      stage: z.literal('model-output'),
      code: z.literal('MODEL_OUTPUT_INVALID'),
    }),
    z.strictObject({
      ...source,
      stage: z.literal('contract-validation'),
      code: z.literal('WORKFLOW_GRAPH_PLANNING_FAILED'),
      violations: workflowConnectionRevisionViolationsSchema.optional(),
      constraints: workflowPlanningConstraintInspectionSchema.optional(),
    }),
  ],
);
