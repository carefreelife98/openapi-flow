import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ApiOperationContract,
  ClarificationQuestionLimits,
  WorkflowClarificationOptions,
  WorkflowDecisionExplanation,
  WorkflowMessageEvidence,
  WorkflowNativeEvidence,
  WorkflowEntryPointEvidence,
  WorkflowPlanningContext,
  WorkflowRequirementsProposal,
  WorkflowSourceMessage,
} from '@openapi-flow/core';

export interface ClarifyWorkflowRequirementsInput {
  context: WorkflowPlanningContext;
  limits: ClarificationQuestionLimits;
  options?: WorkflowClarificationOptions;
  model: BaseChatModel;
  /** Earlier intent, not authority for a new statement or answer. */
  backgroundMessages?: WorkflowSourceMessage[];
}
export interface WorkflowClarificationOasCandidate {
  candidateId: string;
  operation: ApiOperationContract;
}
export interface ProposedWorkflowOasEvidence {
  kind: 'oas';
  candidateId: string;
}
export type ProposedWorkflowPlanningEvidence =
  | WorkflowMessageEvidence
  | WorkflowNativeEvidence
  | WorkflowEntryPointEvidence
  | ProposedWorkflowOasEvidence;
export type WorkflowRequirementsModelOutput =
  WorkflowRequirementsProposal<ProposedWorkflowPlanningEvidence>;
export interface CanonicalWorkflowExplanationFields {
  explanation?: WorkflowDecisionExplanation;
}
