import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowDraftNativeNodeAdditionInput,
  WorkflowDraftNativeDependenciesInput,
} from '@openapi-flow/core';

export interface PlanWorkflowDraftNativeDependenciesInput extends WorkflowDraftNativeDependenciesInput {
  /** Required only when the original plan offers a producer choice. */
  model?: BaseChatModel;
}

export interface GenerateWorkflowDraftNativeNodeAdditionInput extends WorkflowDraftNativeNodeAdditionInput {
  /** Not required when the implementation proves the sole valid setting is {}. */
  model?: BaseChatModel;
}
export interface SelectWorkflowDraftNativeNodeParameterOwnershipInput extends WorkflowDraftNativeNodeAdditionInput {
  /** No model is needed when policy or the implementation permits only literals. */
  model?: BaseChatModel;
}
export interface WorkflowDraftNativeNodeAdditionPlanningFailure {
  stage:
    | 'proposal-schema'
    | 'node-validation'
    | 'ownership'
    | 'producer-dependencies';
  output: unknown;
}
