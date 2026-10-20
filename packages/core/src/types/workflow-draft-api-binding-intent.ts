import type { JsonObject } from './openapi.js';
import type { ApiOperationContract } from './api-operation.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';
import type {
  ProposedWorkflowDraftSourceEvidence,
  ResolvedWorkflowDraftSourceEvidence,
  WorkflowDraftSourceEvidenceDescription,
} from './workflow-draft-source-evidence.js';
import type { WorkflowDraftApiCallPlanningInput } from './workflow-draft-api-call-planning.js';

/** Select requested response-to-request targets, not their sources or values. */
export interface WorkflowDraftApiBindingIntentProposal extends ProposedWorkflowDraftSourceEvidence {
  targets: string[];
}
export interface WorkflowDraftApiBindingIntent extends ResolvedWorkflowDraftSourceEvidence {
  fingerprint: string;
  proposal: WorkflowDraftApiBindingIntentProposal;
  targets: string[];
}
export interface ResolveWorkflowDraftApiBindingIntentInput extends WorkflowDraftApiCallPlanningInput {
  fingerprint: string;
  proposal: WorkflowDraftApiBindingIntentProposal;
}
export interface WorkflowDraftApiBindingIntentDescription extends WorkflowDraftSourceEvidenceDescription {
  fingerprint: string;
  instruction: string;
  operation: ApiOperationContract;
  requestSchema: JsonObject;
  requestMediaType?: string;
  backgroundMessages: WorkflowSourceMessage[];
  hasRequestInputs: boolean;
  hasPotentialPredecessors: boolean;
}
