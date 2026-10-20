import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowDraftApiCallPlanningInput,
  WorkflowDraftApiCallBindingsInput,
  WorkflowDraftApiCallArgumentsInput,
} from '@openapi-flow/core';

export interface SelectWorkflowDraftApiBindingInputsInput extends WorkflowDraftApiCallPlanningInput {
  model?: BaseChatModel;
}
export interface PlanWorkflowDraftApiCallBindingsInput extends WorkflowDraftApiCallBindingsInput {
  model?: BaseChatModel;
}
export interface GenerateWorkflowDraftApiCallArgumentsInput extends WorkflowDraftApiCallArgumentsInput {
  model?: BaseChatModel;
}
export interface WorkflowDraftApiCallPlanningFailure {
  stage: 'binding-inputs' | 'bindings' | 'arguments';
  output: unknown;
}
