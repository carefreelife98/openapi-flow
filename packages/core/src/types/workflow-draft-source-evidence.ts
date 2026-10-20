import type { WorkflowDraftReferenceSources } from './workflow-draft-reference-sources.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';
import type { WorkflowCapability } from './workflow-plan.js';
import type {
  WorkflowMessageEvidence,
  WorkflowPlanningEvidence,
} from './planning-evidence.js';
import type { WorkflowDecisionExplanation } from './workflow-clarification.js';

export type WorkflowDraftSourceEvidence =
  { kind: 'message'; messageId: string } | { kind: 'source'; nodeId: string };
export interface ProposedWorkflowDraftSourceEvidence {
  sourceMessageIds: string[];
  explanation?: WorkflowDecisionExplanation<WorkflowDraftSourceEvidence>;
}
export interface WorkflowDraftSourceEvidenceDescription {
  sources: WorkflowDraftReferenceSources;
  messages: WorkflowSourceMessage[];
  includeExplanations: boolean;
}
export interface ResolvedWorkflowDraftSourceEvidence {
  sources: WorkflowMessageEvidence[];
  explanation?: WorkflowDecisionExplanation<WorkflowPlanningEvidence>;
}
export interface ResolveWorkflowDraftSourceEvidenceInput {
  decision: ProposedWorkflowDraftSourceEvidence;
  description: WorkflowDraftSourceEvidenceDescription;
  capabilities: WorkflowCapability[];
}
