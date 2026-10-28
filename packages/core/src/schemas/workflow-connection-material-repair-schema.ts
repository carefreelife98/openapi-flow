import { z } from 'zod';
import { workflowConnectionMaterialRepairRequestSchema } from './workflow-connection-material-repair-request-schema.js';
import { workflowConnectionStepExpectationSchema } from './workflow-connection-session-schema.js';
import { workflowMaterialArgumentSchema } from './workflow-planning-material-schema.js';
import { workflowDraftNativeNodeSchema } from './workflow-draft-schema.js';
import { workflowDeferredApiInputIdsSchema } from './workflow-api-input-deferral-schema.js';

/** Actual execution material only. Model/audit records are retained separately by the host. */
export const workflowConnectionMaterialReplacementSchema = z.strictObject({
  apiArguments: z.array(workflowMaterialArgumentSchema),
  nativeNodes: z.array(workflowDraftNativeNodeSchema),
  /** Explicit host policy, not model-generated values or an automatic approval of new slots. */
  deferredApiInputIds: workflowDeferredApiInputIdsSchema.optional(),
});
export const workflowConnectionSourceRepairRequestSchema = z.strictObject({
  kind: z.literal('replan-materials'),
  sourceFingerprint:
    workflowConnectionStepExpectationSchema.shape.sourceFingerprint,
  request: workflowConnectionMaterialRepairRequestSchema,
});
export const workflowConnectionSourceRepairReceiptSchema = z.strictObject({
  request: workflowConnectionSourceRepairRequestSchema,
  replacement: workflowConnectionMaterialReplacementSchema,
  afterSourceFingerprint:
    workflowConnectionStepExpectationSchema.shape.sourceFingerprint,
  /** Original binding result before dependent argument work; replay derives the expanded request again. */
  workSource: z
    .strictObject({
      request: workflowConnectionSourceRepairRequestSchema,
      replacement: workflowConnectionMaterialReplacementSchema,
    })
    .optional(),
});
