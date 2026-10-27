import { z } from 'zod';
import { planningEvidenceTextSchema as text } from './planning-evidence-schema.js';
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

export const workflowConnectionMaterialRepairTargetSchema = z.strictObject({
  stage: z.enum([
    'api-bindings',
    'api-arguments',
    'native-dependencies',
    'native-parameters',
  ]),
  nodeId: text,
});
export const workflowConnectionMaterialRepairRequestSchema = z.strictObject({
  kind: z.literal('replan-materials'),
  targets: z.array(workflowConnectionMaterialRepairTargetSchema).min(1),
  factIds: z.array(text).min(1),
  reason: text,
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
