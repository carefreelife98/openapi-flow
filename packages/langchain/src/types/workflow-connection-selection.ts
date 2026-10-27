import type { z } from 'zod';
import type { createWorkflowConnectionSelectionSchema } from '../schemas/workflow-connection-selection-schema.js';

export type WorkflowConnectionSelectionOutput = z.infer<
  ReturnType<typeof createWorkflowConnectionSelectionSchema>
>;
