import type { JsonValue } from './api-arguments.js';
import type { WorkflowDraftChange } from './workflow-draft-changes.js';
import type {
  WorkflowDraft,
  WorkflowDraftContent,
  WorkflowDraftContext,
} from './workflow-draft.js';
import type { WorkflowDraftEditPlan } from './workflow-draft-edit.js';
import type {
  PreparedWorkflowDraftEdit,
  WorkflowDraftValueEdit,
} from './workflow-draft-edit-assembly.js';

export interface PrimaryWorkflowDraftEdit extends PreparedWorkflowDraftEdit {
  changes: WorkflowDraftChange[];
  pendingResolutionStepIds: string[];
}
export type WorkflowDraftEditPreparationMode = 'complete' | 'staged';
export interface InspectWorkflowDraftEditRepairsInput {
  before: WorkflowDraft;
  content: WorkflowDraftContent;
  context: WorkflowDraftContext;
  plan: WorkflowDraftEditPlan;
  acknowledgedTaskIds: Set<string>;
  pendingResolutionStepIds: string[];
}
export interface ApplyWorkflowDraftValueEditsInput {
  value: JsonValue;
  edits: WorkflowDraftValueEdit[];
  source: string;
}
