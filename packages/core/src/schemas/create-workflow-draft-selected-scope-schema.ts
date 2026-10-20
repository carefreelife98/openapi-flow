import { z } from 'zod';
import type { WorkflowDraftScope } from '../types/workflow-draft.js';

/** Scope identity is shared by clarification and explicit requirement edits, never material readiness. */
export function createWorkflowDraftSelectedScopeSchema(
  nodeIds: string[],
): z.ZodType<WorkflowDraftScope> {
  return z.union([
    z.strictObject({ kind: z.literal('workflow') }),
    ...(nodeIds.length
      ? [
          z.strictObject({
            kind: z.literal('nodes'),
            nodeIds: z
              .array(z.enum(nodeIds))
              .min(1)
              .refine((ids) => new Set(ids).size === ids.length),
          }),
        ]
      : []),
  ]);
}
