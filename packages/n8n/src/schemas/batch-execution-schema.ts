import { z } from 'zod';

export const batchExecutionScopeSchema = z.strictObject({
  id: z
    .string()
    .min(1)
    .regex(/\S/, 'batch id must not contain only whitespace'),
  batchSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  nodeIds: z.array(z.string().min(1)).min(1),
  entryNodeId: z.string().min(1),
  exitNodeId: z.string().min(1),
});
export const batchExecutionScopesSchema = z
  .array(batchExecutionScopeSchema)
  .min(1);
