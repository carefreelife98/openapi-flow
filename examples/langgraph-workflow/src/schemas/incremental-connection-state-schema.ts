import { StateSchema } from '@langchain/langgraph';
import { z } from 'zod';
import {
  workflowConnectionSessionSchema,
  workflowConnectionRejectedProposalSchema,
} from '@openapi-flow/core';
import type {
  ReviewableWorkflowGraphPlan,
  NativeInstanceSelection,
  NativeInstanceDependencyPlan,
  NativeNodeParameterResult,
  PlannedNativeNode,
} from '@openapi-flow/core';
import type { PlanWorkflowConnectionStepResult } from '@openapi-flow/langchain';
import { workflowConnectionGoalRejectionSchema } from '@openapi-flow/langchain';
import type { IncrementalNativeMaterialReceipt } from '../types/incremental-connections.js';

export const incrementalConnectionPolicySchema = z.strictObject({
  maxModelInvocations: z.int().positive(),
  maxRejectedProposals: z.int().nonnegative(),
  deadlineMs: z.int().positive(),
});

// Runtime source/model/observers stay outside checkpoint state.
export const incrementalConnectionStateSchema = new StateSchema({
  session: workflowConnectionSessionSchema.optional(),
  startedAt: z.number().nonnegative().optional(),
  modelInvocations: z.int().nonnegative().optional(),
  rejectedProposals: z
    .array(workflowConnectionRejectedProposalSchema)
    .optional(),
  rejectedGoalProposals: z
    .array(workflowConnectionGoalRejectionSchema)
    .optional(),
  pending: z.custom<PlanWorkflowConnectionStepResult>().optional(),
  nextModelStage: z
    .enum(['goals', 'step', 'native-dependencies', 'native-parameters'])
    .optional(),
  status: z
    .enum([
      'planning',
      'complete',
      'needs-native-material',
      'needs-user-decision',
    ])
    .optional(),
  plan: z.custom<ReviewableWorkflowGraphPlan>().optional(),
  failureId: z.uuid().optional(),
  additionalNativeNodes: z.custom<PlannedNativeNode[]>().optional(),
  materialExtensions: z.custom<IncrementalNativeMaterialReceipt[]>().optional(),
  nativeSelection: z.custom<NativeInstanceSelection>().optional(),
  nativeDependencies: z.custom<NativeInstanceDependencyPlan>().optional(),
  nativeConfiguration: z.custom<NativeNodeParameterResult>().optional(),
});
