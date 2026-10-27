import { z } from 'zod';
import { workflowConnectionStepExpectationSchema } from '@openapi-flow/core';

/** Exact private proposal feedback, never a public progress or error payload. */
export const workflowConnectionOutlineRejectionSchema = z.discriminatedUnion(
  'stage',
  [
    z.strictObject({
      requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      expected: workflowConnectionStepExpectationSchema,
      stage: z.literal('model-output'),
      code: z.literal('MODEL_OUTPUT_INVALID'),
      output: z.json(),
      reason: z.string().min(1),
    }),
    z.strictObject({
      requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      expected: workflowConnectionStepExpectationSchema,
      stage: z.literal('contract-validation'),
      code: z.literal('WORKFLOW_GRAPH_PLANNING_FAILED'),
      output: z.json(),
      reason: z.string().min(1),
    }),
  ],
);
