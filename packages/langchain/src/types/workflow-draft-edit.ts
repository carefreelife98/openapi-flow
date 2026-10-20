import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  WorkflowDraftEditInput,
  WorkflowDraftEditOptions,
  WorkflowDraftEditProposal,
  ApiOperationContract,
} from '@openapi-flow/core';
import type { ProposedWorkflowPlanningEvidence } from './workflow-clarification.js';

export interface AnalyzeWorkflowDraftEditInput extends WorkflowDraftEditInput {
  options?: WorkflowDraftEditOptions;
  model: BaseChatModel;
}
export type WorkflowDraftEditModelOutput = WorkflowDraftEditProposal<
  string,
  ProposedWorkflowPlanningEvidence
>;
export interface WorkflowDraftEditOperationCandidate {
  candidateId: string;
  operation: ApiOperationContract;
}
export interface WorkflowDraftEditPlanningFailure {
  stage: 'proposal-schema' | 'proposal-validation';
  proposal: unknown;
}
