import { z } from 'zod';

export const requestMediaSelectionOptionsSchema = z.strictObject({
  includeExplanations: z.boolean().optional(),
});
