import { z } from 'zod';
import { workflowDraftCapabilityGapSchema } from './workflow-draft-capability-gap-schema.js';
import type { DraftChangeSet } from '../types/workflow-draft-changes.js';
import {
  draftRevisionSchema,
  workflowDraftApiCallSchema,
  workflowDraftNativeNodeSchema,
  workflowDraftEdgeSchema,
  workflowDraftRequirementSchema,
} from './workflow-draft-schema.js';

export const draftChangeSetSchema: z.ZodType<DraftChangeSet> = z.strictObject({
  baseRevision: draftRevisionSchema,
  changes: z
    .array(
      z.discriminatedUnion('kind', [
        z.strictObject({
          kind: z.literal('add-capability-gap'),
          node: workflowDraftCapabilityGapSchema,
        }),
        z.strictObject({
          kind: z.literal('add-api-call'),
          call: workflowDraftApiCallSchema,
        }),
        z.strictObject({
          kind: z.literal('update-api-call'),
          call: workflowDraftApiCallSchema,
        }),
        z.strictObject({
          kind: z.literal('add-native-node'),
          node: workflowDraftNativeNodeSchema,
        }),
        z.strictObject({
          kind: z.literal('update-native-node'),
          node: workflowDraftNativeNodeSchema,
        }),
        z.strictObject({
          kind: z.literal('remove-node'),
          nodeId: z.string().min(1),
        }),
        z.strictObject({
          kind: z.literal('add-edge'),
          edge: workflowDraftEdgeSchema,
        }),
        z.strictObject({
          kind: z.literal('remove-edge'),
          edge: workflowDraftEdgeSchema,
        }),
        z.strictObject({
          kind: z.literal('set-requirement'),
          requirement: workflowDraftRequirementSchema,
        }),
        z.strictObject({
          kind: z.literal('remove-requirement'),
          requirementId: z.string().min(1),
          sourceMessageIds: z
            .array(z.string().min(1))
            .min(1)
            .refine((ids) => new Set(ids).size === ids.length),
        }),
      ]),
    )
    .min(1),
});
