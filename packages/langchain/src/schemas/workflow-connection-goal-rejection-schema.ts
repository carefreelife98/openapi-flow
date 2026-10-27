import { z } from 'zod';
import {
  workflowConnectionStepExpectationSchema,
  workflowPlanningConstraintInspectionSchema,
} from '@openapi-flow/core';

/** Private planning feedback; never part of the public error JSON or progress projection. */
const source = {
  sourceFingerprint:
    workflowConnectionStepExpectationSchema.shape.sourceFingerprint,
  output: z.json(),
  reason: z.string().min(1),
};

export const workflowConnectionGoalRejectionSchema = z.discriminatedUnion(
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
      constraints: workflowPlanningConstraintInspectionSchema.optional(),
    }),
  ],
);
