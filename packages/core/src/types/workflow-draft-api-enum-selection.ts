import type { ApiInputAnswerSourceLocation } from './api-input-answer-extraction.js';
import type { JsonObject } from './openapi.js';
import type { ApiArgumentValues } from './api-arguments.js';
import type { ApiInputEnumCandidate } from './api-input-enum.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';
import type {
  WorkflowDraftApiCallArgumentsInput,
  WorkflowDraftApiCallArgumentsProposal,
} from './workflow-draft-api-call-planning.js';

export interface WorkflowDraftApiEnumSelection {
  candidateId: string;
  messageId: string;
  sourceText: string;
  reason: string;
}

export interface VerifiedWorkflowDraftApiEnumSelection
  extends ApiInputEnumCandidate, WorkflowDraftApiEnumSelection {
  occurrences: ApiInputAnswerSourceLocation[];
}

export interface WorkflowDraftApiEnumChoicesInput extends WorkflowDraftApiCallArgumentsInput {
  proposal: WorkflowDraftApiCallArgumentsProposal;
}

export interface WorkflowDraftApiEnumChoicesDescription {
  candidates: ApiInputEnumCandidate[];
  targets: WorkflowDraftApiEnumTarget[];
}

export interface WorkflowDraftApiEnumTarget {
  targetPointer: string;
  schema: JsonObject | boolean;
  description?: string;
}

export interface WorkflowDraftApiEnumResolution {
  values: ApiArgumentValues;
  selections: VerifiedWorkflowDraftApiEnumSelection[];
}

export interface WorkflowDraftApiEnumSelectionProposal {
  selections: WorkflowDraftApiEnumSelection[];
}

export interface VerifyWorkflowDraftApiEnumSelectionInput {
  selection: WorkflowDraftApiEnumSelection;
  candidates: ApiInputEnumCandidate[];
  messages: WorkflowSourceMessage[];
}
