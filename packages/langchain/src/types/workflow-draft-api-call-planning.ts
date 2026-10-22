import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowDraftApiCallPlanningInput,
  WorkflowDraftApiCallBindingsInput,
  WorkflowDraftApiCallArgumentsInput,
  ResolveWorkflowDraftApiCallArgumentsInput,
} from '@openapi-flow/core';

export interface SelectWorkflowDraftApiBindingInputsInput extends WorkflowDraftApiCallPlanningInput {
  model?: BaseChatModel;
}
export interface PlanWorkflowDraftApiCallBindingsInput extends WorkflowDraftApiCallBindingsInput {
  model?: BaseChatModel;
}
export interface GenerateWorkflowDraftApiCallArgumentsInput extends WorkflowDraftApiCallArgumentsInput {
  model?: BaseChatModel;
  /** Interpret requested enum meanings by selecting original OAS candidates, never by generating values. */
  selectOasEnums?: boolean;
}
export interface SelectWorkflowDraftApiEnumsInput extends ResolveWorkflowDraftApiCallArgumentsInput {
  model: BaseChatModel;
}
export interface WorkflowDraftApiCallPlanningFailure {
  stage: 'binding-inputs' | 'bindings' | 'arguments' | 'enum-selection';
  output: unknown;
}
