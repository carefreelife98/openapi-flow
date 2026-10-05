import type { z } from 'zod';
import type { createOperationPlanSchema } from '@openapi-flow/core/internal';
import type { createOperationSelectionSchema } from '../../legacy/schemas/operation-selection-schema.js';

export type OperationSelectionOutput = z.infer<
  ReturnType<typeof createOperationSelectionSchema>
>;

export type OperationPlanOutput = z.infer<
  ReturnType<typeof createOperationPlanSchema>
>;
