import type { z } from 'zod';
import type { createApiSelectionAnalysisSchema } from '../schemas/api-selection-analysis-schema.js';

export type ApiSelectionAnalysisOutput = z.infer<
  ReturnType<typeof createApiSelectionAnalysisSchema>
>;
