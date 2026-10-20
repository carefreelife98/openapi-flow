import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { WorkflowDraftApiBindingEditInput } from '@openapi-flow/core';

export interface PlanWorkflowDraftApiBindingEditInput extends WorkflowDraftApiBindingEditInput {
  model: BaseChatModel;
}
export interface WorkflowDraftApiBindingEditPlanningFailure {
  stage: 'proposal-schema' | 'proposal-validation';
  output: unknown;
}
