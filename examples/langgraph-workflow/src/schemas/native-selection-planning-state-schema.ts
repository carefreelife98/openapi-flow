import { StateSchema } from '@langchain/langgraph';
import { z } from 'zod';
import { nativePlanningRejectionSchema } from '@openapi-flow/langchain';
import type {
  NativeInstanceSelection,
  NativeInstanceSelectionReview,
} from '@openapi-flow/core';
import type {
  NativeSelectionPlanningSource,
  NativeSelectionPlanningSnapshot,
  NativeSelectionPlanningProgress,
} from '../types/native-selection-planning.js';

export const nativeSelectionPlanningPolicySchema = z.strictObject({
  /** Reserved structured model calls, including initial selection, review and reselection. Not HTTP retries. */
  maxModelInvocations: z.int().nonnegative(),
  maxReselections: z.int().nonnegative(),
  deadlineMs: z.int().positive().max(2_147_483_647),
});
export const nativeSelectionPlanningStateSchema = new StateSchema({
  source: z.custom<NativeSelectionPlanningSource>().optional(),
  snapshot: z.custom<NativeSelectionPlanningSnapshot>().optional(),
  policy: nativeSelectionPlanningPolicySchema.optional(),
  startedAt: z.int().nonnegative().optional(),
  modelInvocations: z.int().nonnegative().optional(),
  reselections: z.int().nonnegative().optional(),
  selections: z.array(z.custom<NativeInstanceSelection>()).optional(),
  reviews: z.array(z.custom<NativeInstanceSelectionReview>()).optional(),
  rejectedProposals: z.array(nativePlanningRejectionSchema).optional(),
  nextAction: z.enum(['select', 'review']).optional(),
  status: z
    .enum([
      'planning',
      'ready',
      'unavailable-native-behavior',
      'needs-business-decision',
    ])
    .optional(),
  progress: z.custom<NativeSelectionPlanningProgress>().optional(),
  failureId: z.string().optional(),
});
