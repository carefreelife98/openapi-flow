import type { ApiInputLiteralSource } from './api-input-literal-source.js';
import type { ApiInputAnswerSourceLocation } from './api-input-answer-extraction.js';
import type {
  WorkflowDraftApiCallPlanningDescription,
  WorkflowDraftApiCallArgumentsProposal,
} from './workflow-draft-api-call-planning.js';

export interface WorkflowDraftApiLiteralSource extends ApiInputLiteralSource {
  targetPointer: string;
  messageId: string;
}
export interface VerifiedWorkflowDraftApiLiteralSource extends WorkflowDraftApiLiteralSource {
  occurrences: ApiInputAnswerSourceLocation[];
}
export interface ResolveWorkflowDraftApiLiteralSourcesInput {
  description: WorkflowDraftApiCallPlanningDescription;
  proposal: WorkflowDraftApiCallArgumentsProposal;
}
