import { z } from 'zod';
import { workflowConnectionMaterialRepairRequestSchema } from '@openapi-flow/core';

export const workflowProgramReviewSchema = z.strictObject({
  status: z.enum([
    'accepted',
    'needs-revision',
    'needs-user-input',
    'unsupported',
  ]),
  findings: z.array(
    z.strictObject({
      nodeIds: z.array(z.string().min(1)),
      reason: z.string().min(1),
    }),
  ),
  question: z.string().min(1).nullable(),
  revisionTarget: z
    .enum(['reorder-existing-nodes', 'change-prepared-materials'])
    .nullable(),
  materialRepair: workflowConnectionMaterialRepairRequestSchema.nullable(),
});
