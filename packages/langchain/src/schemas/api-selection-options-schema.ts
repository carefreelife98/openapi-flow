import { z } from 'zod';

export const apiSelectionOptionsSchema = z.strictObject({
  includeExplanations: z.boolean().optional(),
});
