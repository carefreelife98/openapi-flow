import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { WorkflowDraftNativeReferenceRepairInput } from '@openapi-flow/core';

export interface PlanWorkflowDraftNativeReferenceRepairInput extends WorkflowDraftNativeReferenceRepairInput {
  model: BaseChatModel;
}
export interface WorkflowDraftNativeReferenceRepairPlanningFailure {
  stage: 'proposal-schema' | 'proposal-validation';
  output: unknown;
}
