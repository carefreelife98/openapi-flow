import { z } from 'zod';
import type {
  WorkflowConnectionDecision,
  WorkflowConnectionPlanningContext,
  WorkflowConnectionPlanningRecord,
} from '../types/workflow-connection-planning.js';
import type { WorkflowPlanningSourceEvidence } from '../types/workflow-planning-materials.js';
import type { WorkflowPlanNodeContract } from '../types/workflow-plan.js';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';
import {
  workflowDraftNativeNodeSchema,
  workflowDraftEdgeSchema,
} from './workflow-draft-schema.js';
import {
  workflowReviewGapSchema,
  workflowBlockedCallSchema,
} from './workflow-planning-material-schema.js';

export const workflowConnectionIdentitySchema = z.strictObject({
  scenario: planningEvidenceTextSchema,
});

export const workflowConnectionProposalSchema = z.strictObject({
  edges: z.array(workflowDraftEdgeSchema),
  additionalGaps: z.array(
    z.strictObject({
      id: planningEvidenceTextSchema,
      description: planningEvidenceTextSchema,
    }),
  ),
  blockedCalls: z.array(workflowBlockedCallSchema),
});

export const workflowConnectionDecisionSchema = z.strictObject({
  reason: planningEvidenceTextSchema,
  edges: z.array(
    workflowDraftEdgeSchema.extend({ reason: planningEvidenceTextSchema }),
  ),
  additionalGaps: workflowConnectionProposalSchema.shape.additionalGaps,
  blockedCalls: z.array(
    workflowBlockedCallSchema.extend({
      reason: planningEvidenceTextSchema,
    }),
  ),
}) satisfies z.ZodType<WorkflowConnectionDecision>;

export const workflowConnectionPlanningResultSchema = z.strictObject({
  nativeNodes: z.array(workflowDraftNativeNodeSchema),
  edges: z.array(workflowDraftEdgeSchema),
  gaps: z.array(workflowReviewGapSchema),
  blockedCalls: z.array(workflowBlockedCallSchema),
  starts: z.array(planningEvidenceTextSchema),
});

/** Nested source receipts must match independently reconstructed source data. */
export const workflowConnectionPlanningRecordSchema = z.strictObject({
  kind: z.literal('proposed-connections'),
  decision: workflowConnectionDecisionSchema,
  plan: workflowConnectionPlanningResultSchema,
  evidence: z.strictObject({
    kind: z.literal('supplied-connection-materials'),
    context: z.custom<WorkflowConnectionPlanningContext>(),
    sources: z.custom<WorkflowPlanningSourceEvidence>(),
  }),
  verification: z.strictObject({
    contracts: z.array(z.custom<WorkflowPlanNodeContract>()),
  }),
}) satisfies z.ZodType<WorkflowConnectionPlanningRecord>;
