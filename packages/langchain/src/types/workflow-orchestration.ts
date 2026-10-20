import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  PlannedNativeNode,
  WorkflowConnectionPlanningInput,
  WorkflowConnectionDecision,
  WorkflowConnectionProposal,
  ExplainedWorkflowBlockedCall,
  ExplainedWorkflowConnection,
} from '@openapi-flow/core';
import type { ReviewableWorkflowGraphOutput } from './reviewable-workflow-planning.js';

export interface PlanWorkflowConnectionsInput extends WorkflowConnectionPlanningInput {
  model: BaseChatModel;
  includeExplanations?: boolean;
}

export interface OrchestrateWorkflowInput extends Omit<
  PlanWorkflowConnectionsInput,
  'nativeNodes'
> {
  workflowId: string;
  preparedNativeNodes?: PlannedNativeNode[];
}

export interface WorkflowConnectionModelDecision extends ReviewableWorkflowGraphOutput {
  reason: string;
  edges: ExplainedWorkflowConnection[];
  blockedCalls?: ExplainedWorkflowBlockedCall[];
}

export type WorkflowConnectionPlanningOutput =
  ReviewableWorkflowGraphOutput | WorkflowConnectionModelDecision;

export interface ResolvedWorkflowConnectionOutput {
  proposal: WorkflowConnectionProposal;
  decision?: WorkflowConnectionDecision;
}
