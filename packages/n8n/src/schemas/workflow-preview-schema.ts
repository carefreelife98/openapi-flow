import { z } from 'zod';
import type { N8nWorkflowPreviewMetadata } from '../types/workflow-preview.js';

const requiredText = z.string().refine((value) => value.trim().length > 0);
export const workflowPreviewOperationKeySchema = z.strictObject({
  documentId: requiredText,
  snapshotId: requiredText,
  operationRef: requiredText,
});

export const workflowPreviewMetadataSchema: z.ZodType<N8nWorkflowPreviewMetadata> =
  z.strictObject({
    id: requiredText,
    name: requiredText,
    scenario: requiredText,
    selection: z.strictObject({
      operations: z.array(
        z.strictObject({
          key: workflowPreviewOperationKeySchema,
          purpose: requiredText,
        }),
      ),
      gaps: z.array(
        z.discriminatedUnion('kind', [
          z.strictObject({
            kind: z.literal('missing_operation'),
            description: requiredText,
          }),
          z.strictObject({
            kind: z.literal('insufficient_contract'),
            description: requiredText,
            operation: workflowPreviewOperationKeySchema,
          }),
        ]),
      ),
    }),
    issues: z
      .array(
        z.strictObject({
          stage: z.enum(['api-bindings', 'workflow-graph']),
          description: requiredText,
        }),
      )
      .optional(),
    proposedNativeNodes: z
      .array(z.strictObject({ id: requiredText, capability: requiredText }))
      .optional(),
    proposedEdges: z
      .array(
        z.strictObject({
          from: requiredText,
          output: requiredText,
          to: requiredText,
          input: requiredText,
        }),
      )
      .optional(),
  });
