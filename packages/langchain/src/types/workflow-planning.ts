import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowApiMaterial,
  WorkflowCapability,
  WorkflowGraphProposal,
  PlannedNativeNode,
  ExplainedWorkflowConnection,
  WorkflowGraphPlanningProposal,
  WorkflowGraphPlanningAssessment,
} from '@openapi-flow/core';

export interface PlanWorkflowGraphInput {
  scenario: string;
  model: BaseChatModel;
  materials: WorkflowApiMaterial[];
  capabilities: WorkflowCapability[];
  preparedNativeNodes?: PlannedNativeNode[];
  includeExplanations?: boolean;
}

export type { PreparedNativeNodeMaterial } from '@openapi-flow/core';

export type WorkflowGraphOutput = Omit<WorkflowGraphProposal, 'nativeNodes'> & {
  additionalNativeNodes?: PlannedNativeNode[];
};

export interface ExplainedGraphNativeNode extends PlannedNativeNode {
  reason: string;
}

export interface ExplainedWorkflowGraphOutput extends WorkflowGraphOutput {
  reason: string;
  additionalNativeNodes?: ExplainedGraphNativeNode[];
  edges: ExplainedWorkflowConnection[];
}

export type WorkflowGraphModelOutput =
  WorkflowGraphOutput | ExplainedWorkflowGraphOutput;

export interface ResolvedWorkflowGraphOutput {
  proposal: WorkflowGraphPlanningProposal;
  assessment?: WorkflowGraphPlanningAssessment;
}

export type WorkflowGraphExplanationMode = 'none' | 'connections' | 'graph';

export type WorkflowGraphPlanningFailure =
  | { stage: 'proposal-schema'; output: unknown }
  | { stage: 'graph-validation'; output: WorkflowGraphModelOutput };
