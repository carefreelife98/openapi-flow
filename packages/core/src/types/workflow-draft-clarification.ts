import type {
  WorkflowClarificationRound,
  WorkflowClarificationResolution,
  WorkflowRequirementFact,
  WorkflowClarificationQuestion,
  WorkflowDecisionExplanation,
} from './workflow-clarification.js';
import type {
  WorkflowPlanningContext,
  WorkflowMessageEvidence,
} from './planning-evidence.js';
import type {
  WorkflowDraftEditInput,
  WorkflowDraftEditPlan,
} from './workflow-draft-edit.js';
import type {
  WorkflowSourceMessage,
  WorkflowDraftScope,
  WorkflowDraftRequirement,
} from './workflow-draft.js';
import type { WorkflowDraftSelectedNode } from './workflow-draft-selected-nodes.js';

export interface WorkflowDraftClarification {
  round: WorkflowClarificationRound;
  resolution: WorkflowClarificationResolution;
  /** Code-derived evidence receipts for explicit replies, not raw user prose or a model summary. */
  answerMessages: WorkflowSourceMessage[];
  /** Verified explicit answers only. Deferral is evidence, but never a confirmed requirement. */
  confirmedAnswerMessageIds: string[];
}
export interface PrepareWorkflowDraftClarificationInput {
  context: WorkflowPlanningContext;
  round: WorkflowClarificationRound;
  resolution: WorkflowClarificationResolution;
}
export interface WorkflowDraftClarificationDescription {
  roundId: string;
  facts: WorkflowRequirementFact[];
  pendingQuestions: WorkflowClarificationQuestion[];
  deferredQuestions: WorkflowClarificationQuestion[];
  requirementsPrompt: string;
  answerMessageIds: string[];
  confirmedAnswerMessageIds: string[];
}
export interface WorkflowDraftRequirementOrigin {
  kind: 'clarification-fact' | 'clarification-question';
  roundId: string;
  sourceId: string;
}
export interface WorkflowDraftClarificationScopeInput extends WorkflowDraftEditInput {
  plan: WorkflowDraftEditPlan;
}
export type WorkflowDraftClarificationRequirement = Omit<
  WorkflowDraftRequirement,
  'scope'
>;
export interface WorkflowDraftClarificationScopeDescription {
  fingerprint: string;
  requirements: WorkflowDraftClarificationRequirement[];
  nodes: WorkflowDraftSelectedNode[];
  messages: WorkflowSourceMessage[];
  includeExplanations: boolean;
}
export interface ProposedWorkflowDraftClarificationScope {
  scope: WorkflowDraftScope | WorkflowDraftUnselectedClarificationScope;
  explanation?: WorkflowDecisionExplanation<WorkflowMessageEvidence>;
}
export interface WorkflowDraftUnselectedClarificationScope {
  kind: 'unselected-work';
}
export interface WorkflowDraftClarificationScopeProposal {
  scopes: Record<string, ProposedWorkflowDraftClarificationScope>;
}
export interface ResolveWorkflowDraftClarificationScopesInput extends WorkflowDraftClarificationScopeInput {
  fingerprint: string;
  proposal: WorkflowDraftClarificationScopeProposal;
}
export interface ResolvedWorkflowDraftClarificationScopes {
  fingerprint: string;
  proposal: WorkflowDraftClarificationScopeProposal;
  requirements: WorkflowDraftRequirement[];
  /** Unresolved questions about work that has no selected instance. These never block unrelated nodes or count as completed. */
  unselectedQuestionIds: string[];
}
