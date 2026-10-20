import type { WorkflowPlanningContext } from './planning-evidence.js';
import type {
  WorkflowClarificationQuestion,
  WorkflowClarificationReply,
} from './workflow-clarification.js';
import type { WorkflowDraftClarification } from './workflow-draft-clarification.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';

export type WorkflowClarificationAnswerChange =
  | { kind: 'replace-answer'; reply: WorkflowClarificationReply }
  | { kind: 'reopen-question'; questionId: string };

export interface WorkflowClarificationAnswerRevisionDescription {
  fingerprint: string;
  roundId: string;
  questions: WorkflowClarificationQuestion[];
  replies: WorkflowClarificationReply[];
}

export interface ReviseWorkflowClarificationAnswersInput {
  context: WorkflowPlanningContext;
  fingerprint: string;
  messageId: string;
  changes: WorkflowClarificationAnswerChange[];
}

/** An immutable transition receipt, not a replacement workflow or an executable edit. */
export interface WorkflowClarificationAnswerRevision {
  id: string;
  fingerprint: string;
  message: WorkflowSourceMessage;
  changes: WorkflowClarificationAnswerChange[];
  before: WorkflowDraftClarification;
  after: WorkflowDraftClarification;
  supersededAnswerMessageIds: string[];
}

export interface WorkflowClarificationAnswerRevisionResult {
  revision: WorkflowClarificationAnswerRevision;
  /** Previous answer evidence is removed, original request evidence is preserved. */
  activeMessages: WorkflowSourceMessage[];
}

export interface ValidateWorkflowClarificationAnswerRevisionInput {
  /** The trusted, original pre-change context; never reconstruct it from a client receipt. */
  context: WorkflowPlanningContext;
  revision: WorkflowClarificationAnswerRevision;
}
