import { z } from 'zod';
import { planningEvidenceTextSchema as text } from './planning-evidence-schema.js';
import {
  workflowConnectionStepExpectationSchema,
  workflowConnectionSessionSchema,
} from './workflow-connection-session-schema.js';

export const workflowConnectionGoalReviewPolicySchema = z.enum([
  'preserve-protected-original-edges',
]);
export const workflowConnectionGoalAssessmentSchema = z.strictObject({
  factId: text,
  status: z.enum(['covered', 'missing', 'contradicted', 'uncertain']),
  goalIds: z.array(text),
  policyIds: z.array(workflowConnectionGoalReviewPolicySchema),
  sourceQuotes: z.array(text).min(1),
  reason: text,
});
export const workflowConnectionGoalReviewProposalSchema = z.strictObject({
  assessments: z.array(workflowConnectionGoalAssessmentSchema).min(1),
});
export const workflowConnectionGoalReviewSchema =
  workflowConnectionGoalReviewProposalSchema
    .extend({
      sessionId: workflowConnectionStepExpectationSchema.shape.sessionId,
      sourceFingerprint:
        workflowConnectionStepExpectationSchema.shape.sourceFingerprint,
      goalFingerprint: workflowConnectionSessionSchema.shape.goalFingerprint,
      accepted: z.boolean(),
    })
    .strict();
export const workflowReviewedGoalCandidateSchema = z.strictObject({
  session: workflowConnectionSessionSchema,
  review: workflowConnectionGoalReviewSchema,
});
