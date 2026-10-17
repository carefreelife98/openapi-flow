import { z } from 'zod';

export const apiOperationKeySchema = z.strictObject({
  documentId: z.string().min(1),
  snapshotId: z.string().min(1),
  operationRef: z.string().min(1),
});
