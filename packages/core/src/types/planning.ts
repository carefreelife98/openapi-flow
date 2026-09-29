import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { z } from 'zod';
import type { createOperationPlanSchema } from '../schemas/operation-plan-schema.js';
import type { createOperationSelectionSchema } from '../schemas/operation-selection-schema.js';
import type { CompileRequest } from './request-workflow.js';

export type OperationSelectionOutput = z.infer<
  ReturnType<typeof createOperationSelectionSchema>
>;

export type OperationPlanOutput = z.infer<
  ReturnType<typeof createOperationPlanSchema>
>;

export interface GenerateRequest extends Omit<CompileRequest, 'plan'> {
  scenario: string;
  model: BaseChatModel;
  requestMediaType?: string;
}
