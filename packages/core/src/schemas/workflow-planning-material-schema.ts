import { z } from 'zod';
import { planningEvidenceTextSchema } from './planning-evidence-schema.js';
import { apiOperationKeySchema } from './api-operation-key-schema.js';
import { workflowDraftApiCallSchema } from './workflow-draft-schema.js';

export const workflowMaterialArgumentSchema = z.strictObject({
  callId: planningEvidenceTextSchema,
  values: workflowDraftApiCallSchema.shape.values,
  bindings: workflowDraftApiCallSchema.shape.bindings,
  requestedInputs: workflowDraftApiCallSchema.shape.requestedInputs,
  unresolvedInputs: z.array(z.string()),
  requestMediaType: planningEvidenceTextSchema.optional(),
});

export const workflowReviewGapSchema = z.strictObject({
  id: planningEvidenceTextSchema,
  stage: z.enum(['api-selection', 'api-bindings', 'workflow-graph']),
  description: planningEvidenceTextSchema,
  operation: apiOperationKeySchema.optional(),
  callId: planningEvidenceTextSchema.optional(),
  targetPointer: z.string().optional(),
});

export const workflowBlockedCallSchema = z.strictObject({
  callId: planningEvidenceTextSchema,
  gapIds: z.array(planningEvidenceTextSchema).min(1),
});
