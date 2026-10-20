import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowDraftApiInputEditInput,
  WorkflowDraftApiInputEditContractInput,
} from '@openapi-flow/core';

export interface SelectWorkflowDraftApiInputEditTargetsInput extends WorkflowDraftApiInputEditInput {
  model: BaseChatModel;
}
export interface GenerateWorkflowDraftApiInputEditsInput extends WorkflowDraftApiInputEditContractInput {
  /** Not needed when the explicit contract contains removals only. */
  model?: BaseChatModel;
}
export interface WorkflowDraftApiInputEditPlanningFailure {
  stage: 'targets' | 'values';
  output: unknown;
}
