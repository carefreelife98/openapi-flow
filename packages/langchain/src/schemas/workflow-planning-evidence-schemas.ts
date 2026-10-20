import { z } from 'zod';
import type { WorkflowPlanningContextDescription } from '@openapi-flow/core';
import type { ProposedWorkflowPlanningEvidence } from '../types/workflow-clarification.js';
import { createWorkflowMessageEvidenceSelectionSchema } from './create-workflow-message-evidence-selection-schema.js';

/** Model candidates are code-owned references, not model-built OAS keys or pointers. */
export function createWorkflowPlanningEvidenceSchemas(
  context: WorkflowPlanningContextDescription,
  candidateIds: string[],
  sourceMessageIds: string[],
) {
  const message = (ids: string[]) => {
    const selected = ids.map((id) => {
      const source = context.messages.find((item) => item.id === id);
      if (!source)
        throw new Error(
          `Planning evidence references unavailable message ${id}`,
        );
      return source;
    });
    return createWorkflowMessageEvidenceSelectionSchema(selected);
  };
  const evidence: z.ZodType<ProposedWorkflowPlanningEvidence> = z.union([
    message(context.messages.map((item) => item.id)),
    ...(context.entrypoint === undefined
      ? []
      : [
          z.strictObject({
            kind: z.literal('entrypoint'),
            entrypoint: z.literal(context.entrypoint.kind),
          }),
        ]),
    ...(candidateIds.length
      ? [
          z.strictObject({
            kind: z.literal('oas'),
            candidateId: z
              .enum(candidateIds)
              .describe(
                'Select a supplied operation; code attaches its original identity and root location.',
              ),
          }),
        ]
      : []),
    ...(context.capabilities.length
      ? [
          z.strictObject({
            kind: z.literal('native'),
            capability: z.enum(context.capabilities.map((item) => item.name)),
          }),
        ]
      : []),
  ]);
  return { message: message(sourceMessageIds), evidence };
}
