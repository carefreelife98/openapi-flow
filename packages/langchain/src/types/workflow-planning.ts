import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowApiMaterial,
  WorkflowCapability,
  WorkflowGraphProposal,
} from '@openapi-flow/core';

export interface PlanWorkflowGraphInput {
  scenario: string;
  model: BaseChatModel;
  materials: WorkflowApiMaterial[];
  capabilities: WorkflowCapability[];
}

export type WorkflowGraphPlanningFailure =
  | { stage: 'proposal-schema'; output: unknown }
  | { stage: 'graph-validation'; output: WorkflowGraphProposal };
