import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { WorkflowDraftConnectionEditInput } from '@openapi-flow/core';

export interface PlanWorkflowDraftConnectionEditInput extends WorkflowDraftConnectionEditInput {
  model: BaseChatModel;
}
export interface WorkflowDraftConnectionEditPlanningFailure {
  stage: 'proposal-schema' | 'proposal-validation';
  output: unknown;
}
