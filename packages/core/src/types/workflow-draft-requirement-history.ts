import type { WorkflowMessageEvidence } from './planning-evidence.js';
import type {
  WorkflowDraftRequirement,
  WorkflowSourceMessage,
  WorkflowDraftContext,
} from './workflow-draft.js';
import type { PrepareWorkflowDraftEditInput } from './workflow-draft-edit-assembly.js';

export interface WorkflowDraftEditCandidateContextInput<
  Context extends WorkflowDraftContext,
> extends Omit<PrepareWorkflowDraftEditInput, 'context'> {
  context: Context;
}
export type WorkflowDraftEditCandidateContext<
  Context extends WorkflowDraftContext,
> = Omit<Context, 'messages' | 'planningMessageIds'> &
  Pick<WorkflowDraftContext, 'messages' | 'planningMessageIds'>;

export interface WorkflowDraftRequirementHistoryFields {
  id: string;
  revision: number;
  requirementId: string;
  previousEntryId?: string;
  evidence: WorkflowMessageEvidence[];
}
export type WorkflowDraftRequirementHistoryEntry =
  WorkflowDraftRequirementHistoryFields &
    (
      | { kind: 'created' | 'restored'; after: WorkflowDraftRequirement }
      | {
          kind: 'revised';
          before: WorkflowDraftRequirement;
          after: WorkflowDraftRequirement;
        }
      | { kind: 'removed'; before: WorkflowDraftRequirement }
    );
export interface AppendWorkflowDraftRequirementHistoryInput {
  draftId: string;
  revision: number;
  history: WorkflowDraftRequirementHistoryEntry[];
  before?: WorkflowDraftRequirement;
  after?: WorkflowDraftRequirement;
  sourceMessageIds: string[];
  messages: WorkflowSourceMessage[];
}
export interface WorkflowDraftRequirementHistoryDescription {
  draftId: string;
  revision: number;
  entries: WorkflowDraftRequirementHistoryEntry[];
  current: { requirementId: string; entryId: string }[];
  removed: { requirementId: string; entryId: string }[];
}
