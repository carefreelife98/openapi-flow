import { z } from 'zod';
import { workflowConnectionStepExpectationSchema } from '@openapi-flow/core';

/** Server-private decoded model output; never a prompt, OAS, provider response or public event. */
export const workflowConnectionProposalAttemptSchema = z.strictObject({
  id: z.uuid(),
  expected: workflowConnectionStepExpectationSchema,
  capture: z.discriminatedUnion('status', [
    z.strictObject({ status: z.literal('captured'), output: z.json() }),
    z.strictObject({
      status: z.literal('withheld'),
      reason: z.literal('sensitive-content'),
    }),
    z.strictObject({
      status: z.literal('unavailable'),
      reason: z.literal('non-json-output'),
    }),
  ]),
});
