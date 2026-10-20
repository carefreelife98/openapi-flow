import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { WorkflowDraftClarificationScopeInput } from '@openapi-flow/core';

export interface PlanWorkflowDraftClarificationScopesInput extends WorkflowDraftClarificationScopeInput {
  model: BaseChatModel;
}
export interface WorkflowDraftClarificationScopePlanningFailure {
  stage: 'scope-schema' | 'scope-resolution';
  output: unknown;
}
