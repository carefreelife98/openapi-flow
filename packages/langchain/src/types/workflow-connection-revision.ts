import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { z } from 'zod';
import type { workflowConnectionRevisionRejectionSchema } from '../schemas/workflow-connection-revision-rejection-schema.js';
import type {
  WorkflowConnectionRevisionInput,
  WorkflowConnectionRevision,
  WorkflowConnectionMaterialRepairRequest,
  WorkflowConnectionMaterialRepairReceipt,
  WorkflowConnectionRejectedProposal,
  WorkflowConnectionGoalReview,
} from '@openapi-flow/core';
import type {
  WorkflowConnectionGoalSelection,
  WorkflowConnectionPatchSelection,
} from './incremental-connection-planning.js';

export interface PlanWorkflowConnectionRevisionInput extends WorkflowConnectionRevisionInput {
  model: BaseChatModel;
  signal?: AbortSignal;
  rejectedProposals?: WorkflowConnectionRevisionRejection[];
  rejectedConnections?: WorkflowConnectionRejectedProposal[];
  rejectedGoalReviews?: WorkflowReviewedConnectionRevision[];
}
export interface WorkflowReviewedConnectionRevision {
  revision: WorkflowConnectionRevision;
  review: WorkflowConnectionGoalReview;
}
export type WorkflowConnectionRevisionRejection = z.infer<
  typeof workflowConnectionRevisionRejectionSchema
>;
export interface CreateWorkflowConnectionRevisionRejectionInput extends WorkflowConnectionRevisionInput {
  error: unknown;
}
export interface WorkflowConnectionRevisionSelection {
  kind: 'revise-connections';
  goals: WorkflowConnectionGoalSelection[];
  graphChange: WorkflowConnectionPatchSelection;
}
export type WorkflowConnectionRevisionModelDecision =
  WorkflowConnectionRevisionSelection | WorkflowConnectionMaterialRepairRequest;
export interface WorkflowConnectionRevisionModelOutput {
  decision: WorkflowConnectionRevisionModelDecision;
}
export interface RevisedWorkflowConnections {
  kind: 'revised-connections';
  revision: WorkflowConnectionRevision;
}
export type PlanWorkflowConnectionRevisionResult =
  RevisedWorkflowConnections | WorkflowConnectionMaterialRepairReceipt;
