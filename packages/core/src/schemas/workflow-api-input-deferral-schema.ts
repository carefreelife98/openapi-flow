import { z } from 'zod';

export const workflowDeferredApiInputIdsSchema = z
  .array(z.string().refine((value) => value.trim().length > 0))
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'deferredApiInputIds must contain distinct current input slot IDs',
  });
