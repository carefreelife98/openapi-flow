import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowApiMaterial,
  WorkflowCapability,
  WorkflowGraphProposal,
  PlannedNativeNode,
} from '@openapi-flow/core';

export interface PlanWorkflowGraphInput {
  scenario: string;
  model: BaseChatModel;
  materials: WorkflowApiMaterial[];
  capabilities: WorkflowCapability[];
  preparedNativeNodes?: PlannedNativeNode[];
}

export interface PreparedNativeNodeMaterial extends PlannedNativeNode {
  inputPorts: string[];
  outputPorts: string[];
}

export type WorkflowGraphOutput = Omit<WorkflowGraphProposal, 'nativeNodes'> & {
  additionalNativeNodes: PlannedNativeNode[];
};

export type WorkflowGraphPlanningFailure =
  | { stage: 'proposal-schema'; output: unknown }
  | { stage: 'graph-validation'; output: WorkflowGraphOutput };
