import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowConnectionNativeRepairInput,
  WorkflowConnectionNativeParametersInput,
} from '@openapi-flow/core';

export interface PlanWorkflowConnectionNativeDependenciesInput extends WorkflowConnectionNativeRepairInput {
  model?: BaseChatModel;
  signal?: AbortSignal;
}
export interface GenerateWorkflowConnectionNativeParametersInput extends WorkflowConnectionNativeParametersInput {
  model?: BaseChatModel;
  signal?: AbortSignal;
}

export interface WorkflowConnectionNativeRepairFailure {
  operation:
    | 'planWorkflowConnectionNativeDependencies'
    | 'generateWorkflowConnectionNativeParameters';
  fingerprint: string;
  /** Private original response, including malformed output; never a browser diagnostic or a repaired proposal. */
  output: unknown;
}
