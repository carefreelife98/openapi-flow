import { z } from 'zod';

export const apiOperationCallPurposesSchema = z
  .array(z.string().trim().min(1))
  .min(2);
