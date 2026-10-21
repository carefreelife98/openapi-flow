import { z } from 'zod';

export const apiOperationChoiceBoundsSchema = z
  .strictObject({
    minSelections: z.number().int().nonnegative().safe(),
    maxSelections: z.number().int().nonnegative().safe(),
  })
  .refine((bounds) => bounds.minSelections <= bounds.maxSelections, {
    message: 'minSelections must not exceed maxSelections',
  });
