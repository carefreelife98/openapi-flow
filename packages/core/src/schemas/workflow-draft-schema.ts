import { z } from 'zod';
import type {
  WorkflowDraft,
  WorkflowDraftContent,
} from '../types/workflow-draft.js';
import { apiOperationKeySchema } from './api-operation-key-schema.js';
import { createWorkflowDraftRequirementHistorySchema } from './create-workflow-draft-requirement-history-schema.js';
import { nativeRuntimeParametersSchema } from './native-runtime-input-slot-schema.js';
import { requestedApiInputsSchema } from './requested-api-inputs-schema.js';
import { workflowDraftCapabilityGapSchema } from './workflow-draft-capability-gap-schema.js';

const identity = z.string().refine((value) => value.trim().length > 0);
const distinctIds = z
  .array(identity)
  .min(1)
  .refine((ids) => new Set(ids).size === ids.length);
export const draftRevisionSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);

export const workflowDraftScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('workflow') }),
  z.strictObject({ kind: z.literal('nodes'), nodeIds: distinctIds }),
]);

export const workflowDraftRequirementSchema = z.strictObject({
  id: identity,
  text: identity,
  state: z.enum(['confirmed', 'needs-clarification', 'deferred']),
  scope: workflowDraftScopeSchema,
  sourceMessageIds: distinctIds,
  origin: z
    .strictObject({
      kind: z.enum(['clarification-fact', 'clarification-question']),
      roundId: identity,
      sourceId: identity,
    })
    .optional(),
});

export const workflowDraftApiCallSchema = z.strictObject({
  id: identity,
  requestedInputs: requestedApiInputsSchema.optional(),
  operation: apiOperationKeySchema,
  values: z.strictObject({
    path: z.record(z.string(), z.json()).optional(),
    query: z.record(z.string(), z.json()).optional(),
    header: z.record(z.string(), z.json()).optional(),
    cookie: z.record(z.string(), z.json()).optional(),
    querystring: z.record(z.string(), z.json()).optional(),
    body: z.json().optional(),
  }),
  bindings: z.array(
    z.strictObject({
      kind: z.literal('node-output'),
      targetPointer: identity,
      sourceNodeId: identity,
      sourcePointer: z.string(),
    }),
  ),
  requestMediaType: identity.optional(),
});

export const workflowDraftNativeNodeSchema = z.strictObject({
  id: identity,
  capability: identity,
  parameters: z.record(z.string(), z.json()),
  runtimeParameters: nativeRuntimeParametersSchema.optional(),
});

export const workflowDraftEdgeSchema = z.strictObject({
  from: identity,
  output: identity,
  to: identity,
  input: identity,
});

const content = {
  id: identity,
  requirements: z.array(workflowDraftRequirementSchema),
  apiCalls: z.array(workflowDraftApiCallSchema),
  nativeNodes: z.array(workflowDraftNativeNodeSchema),
  gapNodes: z.array(workflowDraftCapabilityGapSchema).optional(),
  edges: z.array(workflowDraftEdgeSchema),
};

export const workflowDraftContentSchema: z.ZodType<WorkflowDraftContent> =
  z.strictObject(content);
export const workflowDraftSchema: z.ZodType<WorkflowDraft> = z.strictObject({
  ...content,
  revision: draftRevisionSchema,
  requirementHistory: z.array(
    createWorkflowDraftRequirementHistorySchema(workflowDraftRequirementSchema),
  ),
  approvals: z.array(
    z.strictObject({
      id: identity,
      revision: draftRevisionSchema,
      nodeIds: distinctIds,
      invalidatedNodeIds: z
        .array(identity)
        .refine((ids) => new Set(ids).size === ids.length),
    }),
  ),
});
