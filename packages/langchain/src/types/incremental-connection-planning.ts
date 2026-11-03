import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ZodType, z } from 'zod';
import type { StructuredOutputSchemaReuse } from './structured-output-schema.js';
import type { workflowConnectionGoalRejectionSchema } from '../schemas/workflow-connection-goal-rejection-schema.js';
import type { BaseMessage } from '@langchain/core/messages';
import type {
  WorkflowConnectionSessionSource,
  WorkflowConnectionSessionInput,
  WorkflowConnectionGoalProposal,
  WorkflowConnectionStepProposal,
  WorkflowConnectionPatch,
  WorkflowConnectionPlanningDecision,
  WorkflowConnectionMaterialRequest,
  WorkflowConnectionMaterialRepairRequest,
  WorkflowConnectionUserDecision,
  WorkflowConnectionRejectedProposal,
  WorkflowConnectionStepExpectation,
  WorkflowReviewedGoalCandidate,
  WorkflowConnectionOutline,
  WorkflowConnectionRegion,
} from '@openapi-flow/core';

export interface PlanWorkflowConnectionGoalsInput extends WorkflowConnectionSessionSource {
  model: BaseChatModel;
  /** Exact rejected output and code-owned validation feedback for this unchanged source. */
  rejectedProposals?: WorkflowConnectionGoalRejection[];
  /** Private independent coverage judgments, not replacement requirements or code-proven semantics. */
  rejectedGoalReviews?: WorkflowReviewedGoalCandidate[];
  signal?: AbortSignal;
}
export type WorkflowConnectionGoalRejection = z.infer<
  typeof workflowConnectionGoalRejectionSchema
>;
export interface CreateWorkflowConnectionGoalRejectionInput extends WorkflowConnectionSessionSource {
  error: unknown;
}
export interface PlanWorkflowConnectionStepInput extends WorkflowConnectionSessionInput {
  model: BaseChatModel;
  /** Feedback for this exact current revision; the host retains historical accounting separately. */
  rejectedProposals?: WorkflowConnectionRejectedProposal[];
  signal?: AbortSignal;
  outline?: WorkflowConnectionOutline;
  bundleId?: string;
  /** Explicit host opt-in to request changes to existing material. Omitted/false retains the original model contract. */
  allowMaterialRevisions?: boolean;
}
/** Default calls retain the non-repair decision type; graph intent uses the region wire. */
export interface PlanWorkflowConnectionStepDefaultInput extends Omit<
  PlanWorkflowConnectionStepInput,
  'allowMaterialRevisions'
> {
  allowMaterialRevisions?: false;
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
export interface WorkflowConnectionIncomingSelection {
  source: WorkflowConnectionEndpointSelection;
  input?: string;
}
export type WorkflowConnectionRegionNodeSelection = {
  nodeId: WorkflowConnectionSessionInput['session']['rootNodeIds'][number];
  incoming: WorkflowConnectionIncomingSelection[];
  root: boolean;
} & ({ finish: boolean } | { finishOutputs: string[] });
export interface WorkflowConnectionRegionSelection extends Pick<
  WorkflowConnectionRegion,
  'kind' | 'factIds' | 'reason'
> {
  nodes: WorkflowConnectionRegionNodeSelection[];
}
export type WorkflowConnectionCompletionRequest = Exclude<
  WorkflowConnectionStepProposal,
  WorkflowConnectionPatch
>;
export type WorkflowConnectionStepModelDecision =
  | WorkflowConnectionRegionSelection
  | WorkflowConnectionCompletionRequest
  | WorkflowConnectionMaterialRequest
  | WorkflowConnectionMaterialRepairRequest
  | WorkflowConnectionUserDecision;
export interface WorkflowConnectionStepModelOutput {
  decision: WorkflowConnectionStepModelDecision;
}
export interface PlanWorkflowConnectionStepResult<
  AllowMaterialRevisions extends boolean = false,
> {
  expected: WorkflowConnectionStepExpectation;
  decision: AllowMaterialRevisions extends true
    ? WorkflowConnectionPlanningDecision
    : Exclude<
        WorkflowConnectionPlanningDecision,
        WorkflowConnectionMaterialRepairRequest
      >;
}
export interface InvokeConnectionPlanningModelInput<Output extends object> {
  model: BaseChatModel;
  operation: string;
  name: string;
  schema: ZodType<Output>;
  schemaReuse?: StructuredOutputSchemaReuse;
  /** Optional distinct receiver validation when display-only fields must not gate execution. */
  validationSchema?: ZodType<Output>;
  messages: BaseMessage[];
  sourceFingerprint?: string;
  requestFingerprint?: string;
  signal?: AbortSignal;
}
export interface WorkflowConnectionPlanningFailure {
  operation: string;
  stage: 'input-validation' | 'model-output' | 'contract-validation';
  code:
    | 'PLANNING_INPUT_INVALID'
    | 'MODEL_OUTPUT_INVALID'
    | 'WORKFLOW_GRAPH_PLANNING_FAILED';
  output: unknown;
  sourceFingerprint?: string;
  requestFingerprint?: string;
}
