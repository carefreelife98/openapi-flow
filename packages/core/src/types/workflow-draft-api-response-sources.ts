import type { ApiOperationContract } from './api-operation.js';
import type {
  WorkflowDraftApiCall,
  WorkflowDraftContent,
  WorkflowDraftContext,
} from './workflow-draft.js';
import type { WorkflowDraftEditPlan } from './workflow-draft-edit.js';

export interface PlannedWorkflowDraftApiSourceRequest {
  status: 'request-planned';
  request: WorkflowDraftApiCall;
}
export interface PendingWorkflowDraftApiSourceRequest {
  status: 'request-pending';
  stepId: string;
  kind: 'add-api-call' | 'replace-api-operation';
  instruction: string;
}
export type WorkflowDraftApiSourcePreparation =
  PlannedWorkflowDraftApiSourceRequest | PendingWorkflowDraftApiSourceRequest;

/** An original selected response contract, not a fabricated request or execution receipt. */
export interface WorkflowDraftApiResponseSource {
  nodeId: string;
  operation: ApiOperationContract;
  preparation: WorkflowDraftApiSourcePreparation;
}
export interface ResolveWorkflowDraftApiResponseSourcesInput {
  content: WorkflowDraftContent;
  context: WorkflowDraftContext;
  plan: WorkflowDraftEditPlan;
  pendingResolutionStepIds: string[];
}
