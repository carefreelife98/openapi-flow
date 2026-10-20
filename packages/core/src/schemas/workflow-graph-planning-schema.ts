import { z } from 'zod';
import type {
  WorkflowGraphPlanningAssessment,
  WorkflowGraphPlanningProposal,
  WorkflowGraphPlanningRecord,
  WorkflowGraphPlanningContext,
  WorkflowGraphPlanningVerification,
} from '../types/workflow-graph-planning.js';
import type { WorkflowPlanningSourceEvidence } from '../types/workflow-planning-materials.js';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';
import {
  workflowDraftNativeNodeSchema,
  workflowDraftEdgeSchema,
} from './workflow-draft-schema.js';
import {
  workflowReviewGapSchema,
  workflowBlockedCallSchema,
} from './workflow-planning-material-schema.js';

export const workflowGraphPlanningIdentitySchema = z.strictObject({
  mode: z.enum(['executable', 'reviewable']),
  scenario: planningEvidenceTextSchema,
});

export const workflowGraphPlanningProposalSchema = z.discriminatedUnion(
  'mode',
  [
    z.strictObject({
      mode: z.literal('executable'),
      additionalNativeNodes: z.array(workflowDraftNativeNodeSchema),
      edges: z.array(workflowDraftEdgeSchema),
      gaps: z.array(
        z.strictObject({ description: planningEvidenceTextSchema }),
      ),
    }),
    z.strictObject({
      mode: z.literal('reviewable'),
      additionalNativeNodes: z.array(workflowDraftNativeNodeSchema),
      edges: z.array(workflowDraftEdgeSchema),
      additionalGaps: z.array(
        z.strictObject({
          id: planningEvidenceTextSchema,
          description: planningEvidenceTextSchema,
        }),
      ),
      blockedCalls: z.array(workflowBlockedCallSchema),
    }),
  ],
) satisfies z.ZodType<WorkflowGraphPlanningProposal>;

export const workflowGraphPlanningAssessmentSchema = z.strictObject({
  reason: planningEvidenceTextSchema,
  nodes: z.array(
    z.strictObject({
      nodeId: planningEvidenceTextSchema,
      reason: planningEvidenceTextSchema,
    }),
  ),
  edges: z.array(
    workflowDraftEdgeSchema.extend({ reason: planningEvidenceTextSchema }),
  ),
  blockedCalls: z.array(
    workflowBlockedCallSchema.extend({ reason: planningEvidenceTextSchema }),
  ),
}) satisfies z.ZodType<WorkflowGraphPlanningAssessment>;

export const executableGraphPlanningResultSchema = z.strictObject({
  nativeNodes: z.array(workflowDraftNativeNodeSchema),
  edges: z.array(workflowDraftEdgeSchema),
  gaps: z.array(z.strictObject({ description: planningEvidenceTextSchema })),
  starts: z.array(planningEvidenceTextSchema),
});
export const reviewableGraphPlanningResultSchema =
  executableGraphPlanningResultSchema.extend({
    gaps: z.array(workflowReviewGapSchema),
    blockedCalls: z.array(workflowBlockedCallSchema),
  });

const fields = {
  proposal: workflowGraphPlanningProposalSchema,
  assessment: workflowGraphPlanningAssessmentSchema,
  evidence: z.strictObject({
    kind: z.literal('supplied-graph-materials'),
    context: z.custom<WorkflowGraphPlanningContext>(),
    sources: z.custom<WorkflowPlanningSourceEvidence>(),
  }),
  verification: z.custom<WorkflowGraphPlanningVerification>(),
};

/** Context, plan and verification must match independent reconstruction from supplied contracts. */
export const workflowGraphPlanningRecordSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...fields,
    kind: z.literal('executable'),
    plan: executableGraphPlanningResultSchema,
  }),
  z.strictObject({
    ...fields,
    kind: z.literal('reviewable'),
    plan: reviewableGraphPlanningResultSchema,
  }),
]) satisfies z.ZodType<WorkflowGraphPlanningRecord>;
