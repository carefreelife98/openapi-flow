import { StateSchema } from '@langchain/langgraph';
import { z } from 'zod';
import { apiArgumentRejectionSchema } from '@openapi-flow/langchain';
import type { ApiCallArguments } from '@openapi-flow/core';
import type { ApiArgumentPlanningSource } from '../types/api-argument-planning.js';

export const apiArgumentPlanningPolicySchema = z.strictObject({
  /** Counts generateApiArguments calls, not provider HTTP retries or its optional enum stage. */
  maxAttempts: z.int().positive(),
  maxRejectedProposals: z.int().nonnegative(),
  /** Node's signed timer range; not an API/node/OAS count restriction. */
  deadlineMs: z.int().positive().max(2_147_483_647),
});

export const apiArgumentPlanningStateSchema = new StateSchema({
  source: z.custom<ApiArgumentPlanningSource>().optional(),
  policy: apiArgumentPlanningPolicySchema.optional(),
  startedAt: z.int().nonnegative().optional(),
  attempts: z.int().nonnegative().optional(),
  rejectedProposals: z.array(apiArgumentRejectionSchema).optional(),
  status: z.enum(['planning', 'complete']).optional(),
  arguments: z.custom<ApiCallArguments>().optional(),
  failureId: z.string().optional(),
});
