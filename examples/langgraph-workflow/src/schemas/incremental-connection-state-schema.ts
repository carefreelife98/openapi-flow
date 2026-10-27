import { StateSchema } from '@langchain/langgraph';
import { z } from 'zod';
import {
  workflowConnectionSessionSchema,
  workflowConnectionRejectedProposalSchema,
  workflowConnectionSourceRepairRequestSchema,
  workflowConnectionSourceRepairReceiptSchema,
  workflowReviewedGoalCandidateSchema,
  workflowConnectionOutlineSchema,
} from '@openapi-flow/core';
import type {
  ReviewableWorkflowGraphPlan,
  NativeInstanceSelection,
  NativeInstanceDependencyPlan,
  NativeNodeParameterResult,
  PlannedNativeNode,
  WorkflowConnectionMaterialReplacement,
  WorkflowConnectionMaterialRepairWorkSubmission,
  WorkflowConnectionRevision,
  WorkflowConnectionMaterialRepairReceipt,
  WorkflowConnectionGoalReview,
} from '@openapi-flow/core';
import type {
  PlanWorkflowConnectionStepResult,
  WorkflowConnectionOutlineRejection,
  WorkflowConnectionRevisionRejection,
  WorkflowReviewedConnectionRevision,
} from '@openapi-flow/langchain';
import {
  workflowConnectionGoalRejectionSchema,
  workflowConnectionOutlineRejectionSchema,
} from '@openapi-flow/langchain';
import type { IncrementalNativeMaterialReceipt } from '../types/incremental-connections.js';
import type { IncrementalConnectionSourceEvent } from '../types/incremental-revisions.js';
import type { IncrementalMaterialArgumentWork } from '../types/incremental-material-arguments.js';

export const incrementalConnectionPolicySchema = z.strictObject({
  maxModelInvocations: z.int().positive(),
  maxRejectedProposals: z.int().nonnegative(),
  deadlineMs: z.int().positive(),
});

// Keep the public inferred state readable without expanding every Zod union implementation detail.
const rejectedOutlineProposalsSchema: z.ZodType<
  WorkflowConnectionOutlineRejection[]
> = z.array(workflowConnectionOutlineRejectionSchema);

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
    .enum([
      'goals',
      'step',
      'native-dependencies',
      'native-parameters',
      'goal-recovery',
      'material-replan',
      'goal-review',
      'outline',
      'revision',
      'revision-review',
      'material-api-arguments',
    ])
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
  materialSourceFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  materialRepairs: z
    .array(workflowConnectionSourceRepairReceiptSchema)
    .optional(),
  pendingMaterialRepair: workflowConnectionSourceRepairRequestSchema.optional(),
  pendingMaterialArgumentWork: z
    .custom<IncrementalMaterialArgumentWork>()
    .optional(),
  pendingMaterialReplacement: z
    .custom<WorkflowConnectionMaterialReplacement>()
    .optional(),
  pendingMaterialWork: z
    .custom<WorkflowConnectionMaterialRepairWorkSubmission>()
    .optional(),
  recoveryPhase: z.enum(['requested', 'replanned', 'applied']).optional(),
  pendingGoalSession: workflowConnectionSessionSchema.optional(),
  goalReviews: z.array(workflowReviewedGoalCandidateSchema).optional(),
  outline: workflowConnectionOutlineSchema.optional(),
  outlineHistory: z.array(workflowConnectionOutlineSchema).optional(),
  rejectedOutlineProposals: rejectedOutlineProposalsSchema.optional(),
  pendingBundleId: z.string().optional(),
  sourceEvents: z.custom<IncrementalConnectionSourceEvent[]>().optional(),
  pendingRevisionRepairs: z
    .array(workflowConnectionSourceRepairReceiptSchema)
    .optional(),
  pendingRevision: z.custom<WorkflowConnectionRevision>().optional(),
  pendingRevisionMaterialRequest: z
    .custom<WorkflowConnectionMaterialRepairReceipt>()
    .optional(),
  pendingRevisionReview: z.custom<WorkflowConnectionGoalReview>().optional(),
  rejectedRevisions: z
    .custom<WorkflowConnectionRevisionRejection[]>()
    .optional(),
  rejectedRevisionReviews: z
    .custom<WorkflowReviewedConnectionRevision[]>()
    .optional(),
  revisionPhase: z
    .enum(['requested', 'candidate', 'reviewed', 'rejected', 'adopted'])
    .optional(),
});
