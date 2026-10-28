import { z } from 'zod';
import { planningEvidenceTextSchema as text } from './planning-evidence-schema.js';
import { workflowConnectionMaterialRepairRequestSchema } from './workflow-connection-material-repair-request-schema.js';
export {
  workflowConnectionMaterialRepairTargetSchema,
  workflowConnectionMaterialRepairRequestSchema,
} from './workflow-connection-material-repair-request-schema.js';
import {
  workflowConnectionGoalProposalSchema,
  workflowConnectionPatchSchema,
  workflowConnectionStepExpectationSchema,
  workflowConnectionViolationSchema,
} from './workflow-connection-session-schema.js';

export const workflowConnectionRevisionViolationsSchema = z
  .array(workflowConnectionViolationSchema)
  .min(1);

/** A model's changed goals and explicit graph changes, never a replacement source or checked flag. */
export const workflowConnectionRevisionProposalSchema = z.strictObject({
  goals: z.array(workflowConnectionGoalProposalSchema).min(1),
  graphChange: workflowConnectionPatchSchema,
});

export const workflowConnectionMaterialRepairReceiptSchema = z.strictObject({
  kind: z.literal('replan-materials'),
  expected: z.strictObject({
    before: workflowConnectionStepExpectationSchema,
    afterSourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    revisionSourceFingerprint:
      workflowConnectionStepExpectationSchema.shape.sourceFingerprint,
  }),
  request: workflowConnectionMaterialRepairRequestSchema,
});

export const workflowConnectionRevisionImpactSchema = z.strictObject({
  changedNodeIds: z.array(text),
  affectedNodeIds: z.array(text),
  preservedNodeIds: z.array(text),
  addedGoalIds: z.array(text),
  removedGoalIds: z.array(text),
  retainedGoalIds: z.array(text),
  affectedFactIds: z.array(text),
  retainedEdgeIds: z.array(text),
  removedEdgeIds: z.array(text),
  addedEdgeIds: z.array(text),
  invalidatedAssessmentGoalIds: z.array(text),
});
