import { z } from 'zod';

export const exclusiveBranchMergeParametersSchema = z.strictObject({
  sourceNodeId: z
    .string()
    .min(1)
    .describe(
      'Existing IF instance whose true and false paths both reach this merge. Do not merge independent branches or discard an alternative.',
    ),
});
