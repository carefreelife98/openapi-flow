import type {
  PrepareWorkflowDraftEditInput,
  StagedWorkflowDraftEdit,
  WorkflowDraftEditRepairTask,
  WorkflowDraftEditRepair,
} from './workflow-draft-edit-assembly.js';
import type { WorkflowNativeReferenceBinding } from './native-parameter-reference.js';
import type { WorkflowDraftReferenceSources } from './workflow-draft-reference-sources.js';
import type { PlannedNativeNode, WorkflowCapability } from './workflow-plan.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';
import type {
  WorkflowMessageEvidence,
  WorkflowPlanningEvidence,
} from './planning-evidence.js';
import type { WorkflowDecisionExplanation } from './workflow-clarification.js';

export interface WorkflowDraftNativeReferenceRepairInput extends PrepareWorkflowDraftEditInput {
  taskId: string;
}
export interface WorkflowDraftNativeRepairBinding extends WorkflowNativeReferenceBinding {
  id: string;
}
export interface WorkflowDraftNativeReferenceRepairDescription {
  fingerprint: string;
  stage: StagedWorkflowDraftEdit;
  task: WorkflowDraftEditRepairTask;
  node: PlannedNativeNode;
  bindings: WorkflowDraftNativeRepairBinding[];
  sources: WorkflowDraftReferenceSources;
  messages: WorkflowSourceMessage[];
  backgroundMessages: WorkflowSourceMessage[];
  instructions: string[];
  includeExplanations: boolean;
}
export type WorkflowDraftNativeRepairEvidence =
  { kind: 'message'; messageId: string } | { kind: 'source'; nodeId: string };
export type WorkflowDraftNativeReferenceRepairChoice =
  | { kind: 'bind'; sourceNodeId: string; sourcePointer?: string }
  | { kind: 'keep' }
  | { kind: 'needs-clarification'; message: string };
export type ProposedWorkflowDraftNativeReferenceRepairDecision =
  WorkflowDraftNativeReferenceRepairChoice & {
    sourceMessageIds: string[];
    explanation?: WorkflowDecisionExplanation<WorkflowDraftNativeRepairEvidence>;
  };
export interface ResolvedWorkflowDraftNativeRepairEvidence {
  sources: WorkflowMessageEvidence[];
  explanation?: WorkflowDecisionExplanation<WorkflowPlanningEvidence>;
}
export type ResolvedWorkflowDraftNativeReferenceRepairDecision =
  WorkflowDraftNativeReferenceRepairChoice &
    ResolvedWorkflowDraftNativeRepairEvidence;
export interface ResolveWorkflowDraftNativeRepairEvidenceInput {
  decision: ProposedWorkflowDraftNativeReferenceRepairDecision;
  description: WorkflowDraftNativeReferenceRepairDescription;
  capabilities: WorkflowCapability[];
}
export interface WorkflowDraftNativeReferenceRepairProposal {
  decisions: Record<string, ProposedWorkflowDraftNativeReferenceRepairDecision>;
}
export interface ResolveWorkflowDraftNativeReferenceRepairInput extends WorkflowDraftNativeReferenceRepairInput {
  fingerprint: string;
  proposal: WorkflowDraftNativeReferenceRepairProposal;
}
export interface WorkflowDraftNativeReferenceRepairQuestion {
  id: string;
  bindingId: string;
  nodeId: string;
  message: string;
  sources: WorkflowMessageEvidence[];
  explanation?: WorkflowDecisionExplanation<WorkflowPlanningEvidence>;
}
export type WorkflowDraftNativeReferenceRepairResult = {
  fingerprint: string;
  proposal: WorkflowDraftNativeReferenceRepairProposal;
  decisions: Record<string, ResolvedWorkflowDraftNativeReferenceRepairDecision>;
} & (
  | {
      status: 'ready';
      repair: Extract<WorkflowDraftEditRepair, { kind: 'native-parameters' }>;
    }
  | {
      status: 'needs-clarification';
      questions: WorkflowDraftNativeReferenceRepairQuestion[];
    }
);
