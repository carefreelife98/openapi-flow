import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowApiMaterial,
  WorkflowCapability,
} from '@openapi-flow/core';

export interface PlanWorkflowGraphInput {
  scenario: string;
  model: BaseChatModel;
  materials: WorkflowApiMaterial[];
  capabilities: WorkflowCapability[];
}
