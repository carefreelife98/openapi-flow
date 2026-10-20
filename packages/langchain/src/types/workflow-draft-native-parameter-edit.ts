import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowDraftNativeParameterEditInput,
  WorkflowDraftNativeParameterEditContractInput,
} from '@openapi-flow/core';

export interface SelectWorkflowDraftNativeParameterEditTargetsInput extends WorkflowDraftNativeParameterEditInput {
  model: BaseChatModel;
}
export interface GenerateWorkflowDraftNativeParameterEditsInput extends WorkflowDraftNativeParameterEditContractInput {
  /** Required only when selected set targets contain actual values to generate. */
  model?: BaseChatModel;
}
export interface WorkflowDraftNativeParameterEditPlanningFailure {
  stage: 'targets' | 'values';
  output: unknown;
}
