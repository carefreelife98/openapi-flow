import type {
  ApiLiteralProposalSource,
  VerifiedApiLiteralProposalSource,
} from './api-input-literal-source.js';
import type {
  WorkflowDraftApiCallPlanningDescription,
  WorkflowDraftApiCallArgumentsProposal,
} from './workflow-draft-api-call-planning.js';

export type WorkflowDraftApiLiteralSource = ApiLiteralProposalSource;
export type VerifiedWorkflowDraftApiLiteralSource =
  VerifiedApiLiteralProposalSource;
export interface ResolveWorkflowDraftApiLiteralSourcesInput {
  description: WorkflowDraftApiCallPlanningDescription;
  proposal: WorkflowDraftApiCallArgumentsProposal;
}
