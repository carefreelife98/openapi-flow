import { z } from 'zod';
import { draftRevisionSchema } from './workflow-draft-schema.js';
import { workflowDraftEditRequestIdsSchema } from './workflow-draft-edit-options-schema.js';

/** Envelope validation precedes contextual decision reconstruction and identity checks. */
export const workflowDraftEditPlanSchema = z.strictObject({
  id: z.string().min(1),
  draftId: z.string().min(1),
  baseRevision: draftRevisionSchema,
  draftFingerprint: z.string().min(1),
  contextFingerprint: z.string().min(1),
  nodeContractsFingerprint: z.string().min(1),
  requestMessageIds: workflowDraftEditRequestIdsSchema,
  options: z.strictObject({ includeExplanations: z.boolean() }),
  status: z.enum(['ready-for-planning', 'needs-clarification', 'no-change']),
  steps: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        decision: z.record(z.string(), z.json()),
        newNodeId: z.string().min(1).optional(),
        stages: z.array(
          z.enum([
            'requirements',
            'resolve-contracts',
            'native-parameters',
            'api-bindings',
            'api-arguments',
            'connections',
            'clarification',
          ]),
        ),
      }),
    )
    .min(1),
});
