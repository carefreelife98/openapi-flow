import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowApiValueContext,
  WorkflowApiArgumentRejection,
  ApiLiteralGenerationInput,
  WorkflowConnectionApiRepairContext,
} from '@openapi-flow/core';
import type { GenerateApiArgumentsInput } from './argument-generation.js';

export interface GenerateWorkflowApiValuesInput extends WorkflowApiValueContext {
  model?: BaseChatModel;
  signal?: AbortSignal;
  rejectedCalls?: WorkflowApiArgumentRejection[];
  materialRepairs?: Record<string, WorkflowConnectionApiRepairContext>;
}

export type GenerateApiValuesInput = Omit<
  ApiLiteralGenerationInput,
  'literalSourceMessages'
> &
  Required<Pick<ApiLiteralGenerationInput, 'literalSourceMessages'>> &
  Pick<
    GenerateApiArgumentsInput,
    'model' | 'selectOasEnums' | 'signal' | 'materialRepair'
  >;
