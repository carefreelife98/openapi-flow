import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ZodType } from 'zod';
import type { BaseMessage } from '@langchain/core/messages';
import type {
  WorkflowConnectionSessionSource,
  WorkflowConnectionSessionInput,
  WorkflowConnectionGoalProposal,
  WorkflowConnectionStepProposal,
  WorkflowConnectionPatch,
  WorkflowConnectionPlanningDecision,
  WorkflowConnectionMaterialRequest,
  WorkflowConnectionUserDecision,
  WorkflowConnectionRejectedProposal,
  WorkflowConnectionStepExpectation,
} from '@openapi-flow/core';

export interface PlanWorkflowConnectionGoalsInput extends WorkflowConnectionSessionSource {
  model: BaseChatModel;
  signal?: AbortSignal;
}
export interface PlanWorkflowConnectionStepInput extends WorkflowConnectionSessionInput {
  model: BaseChatModel;
  rejectedProposals?: WorkflowConnectionRejectedProposal[];
  signal?: AbortSignal;
}
export type WorkflowConnectionRouteGoal = Extract<
  WorkflowConnectionGoalProposal,
  { kind: 'route' }
>;
export interface WorkflowConnectionRouteSelection extends Omit<
  WorkflowConnectionRouteGoal,
  'from' | 'output'
> {
  source: WorkflowConnectionEndpointSelection;
}
export type WorkflowConnectionGoalSelection =
  | Exclude<WorkflowConnectionGoalProposal, WorkflowConnectionRouteGoal>
  | WorkflowConnectionRouteSelection;
export interface WorkflowConnectionGoalsModelOutput {
  goals: WorkflowConnectionGoalSelection[];
}
export interface WorkflowConnectionEndpointSelection {
  nodeId: string;
  /** Omitted in the model contract exactly when this node has only one such port. */
  port?: string;
}
export interface WorkflowConnectionEdgeSelection {
  source: WorkflowConnectionEndpointSelection;
  target: WorkflowConnectionEndpointSelection;
}
export interface WorkflowConnectionPatchSelection extends Omit<
  WorkflowConnectionPatch,
  'addEdges' | 'addTerminals' | 'removeTerminals'
> {
  addEdges: WorkflowConnectionEdgeSelection[];
  addTerminals: WorkflowConnectionEndpointSelection[];
  removeTerminals: WorkflowConnectionEndpointSelection[];
}
export type WorkflowConnectionCompletionRequest = Exclude<
  WorkflowConnectionStepProposal,
  WorkflowConnectionPatch
>;
export type WorkflowConnectionStepModelDecision =
  | WorkflowConnectionPatchSelection
  | WorkflowConnectionCompletionRequest
  | WorkflowConnectionMaterialRequest
  | WorkflowConnectionUserDecision;
export interface WorkflowConnectionStepModelOutput {
  decision: WorkflowConnectionStepModelDecision;
}
export interface PlanWorkflowConnectionStepResult {
  expected: WorkflowConnectionStepExpectation;
  decision: WorkflowConnectionPlanningDecision;
}
export interface InvokeConnectionPlanningModelInput<Output extends object> {
  model: BaseChatModel;
  operation: string;
  name: string;
  schema: ZodType<Output>;
  messages: BaseMessage[];
  signal?: AbortSignal;
}
export interface WorkflowConnectionPlanningFailure {
  operation: string;
  stage: 'model-output' | 'contract-validation';
  code: 'MODEL_OUTPUT_INVALID' | 'WORKFLOW_GRAPH_PLANNING_FAILED';
  output: unknown;
}
