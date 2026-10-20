import { z } from 'zod';
import type { WorkflowDraftApiBindingEditScope } from '../types/workflow-draft-api-binding-edit.js';

export const workflowDraftApiBindingEditScopeSchema = z.discriminatedUnion(
  'kind',
  [
    z.strictObject({ kind: z.literal('step'), stepId: z.string().min(1) }),
    z.strictObject({ kind: z.literal('repair'), taskId: z.string().min(1) }),
  ],
) satisfies z.ZodType<WorkflowDraftApiBindingEditScope>;
