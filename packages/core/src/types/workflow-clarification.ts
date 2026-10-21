import type {
  WorkflowPlanningContext,
  WorkflowPlanningEvidence,
  WorkflowMessageEvidence,
} from './planning-evidence.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';

export interface ClarificationQuestionLimits {
  maxCategories: number;
  maxQuestionsPerCategory: number;
  maxChoicesPerQuestion: number;
  maxQuestionsPerRound: number;
}
export interface WorkflowClarificationOptions {
  includeExplanations?: boolean;
  includeSuggestions?: boolean;
}
export interface ResolvedWorkflowClarificationOptions {
  includeExplanations: boolean;
  includeSuggestions: boolean;
}
export interface WorkflowDecisionExplanation<
  Evidence = WorkflowPlanningEvidence,
> {
  reason: string;
  evidence: Evidence[];
}
export interface ProposedRequirementStatement<
  Evidence = WorkflowPlanningEvidence,
> {
  text: string;
  sources: WorkflowMessageEvidence[];
  explanation?: WorkflowDecisionExplanation<Evidence>;
}
export interface ProposedClarificationChoice<
  Evidence = WorkflowPlanningEvidence,
> {
  label: string;
  explanation?: WorkflowDecisionExplanation<Evidence>;
}
export type ProposedClarificationAnswer<Evidence = WorkflowPlanningEvidence> =
  | { kind: 'text' }
  | {
      kind: 'single-choice' | 'multiple-choice';
      choices: ProposedClarificationChoice<Evidence>[];
    };
export interface ProposedClarificationQuestion<
  Evidence = WorkflowPlanningEvidence,
> {
  message: string;
  answer: ProposedClarificationAnswer<Evidence>;
  explanation?: WorkflowDecisionExplanation<Evidence>;
}
export interface ProposedClarificationCategory<
  Evidence = WorkflowPlanningEvidence,
> {
  title: string;
  questions: ProposedClarificationQuestion<Evidence>[];
  explanation?: WorkflowDecisionExplanation<Evidence>;
}
export interface ProposedWorkflowSuggestion<
  Evidence = WorkflowPlanningEvidence,
> {
  text: string;
  explanation?: WorkflowDecisionExplanation<Evidence>;
}
export interface WorkflowRequirementsProposal<
  Evidence = WorkflowPlanningEvidence,
> {
  statements: ProposedRequirementStatement<Evidence>[];
  categories: ProposedClarificationCategory<Evidence>[];
  suggestions?: ProposedWorkflowSuggestion<Evidence>[];
}
export interface WorkflowClarificationChoice extends ProposedClarificationChoice {
  id: string;
}
export type WorkflowClarificationAnswer =
  | { kind: 'text' }
  | {
      kind: 'single-choice' | 'multiple-choice';
      choices: WorkflowClarificationChoice[];
    };
export interface WorkflowClarificationQuestion extends Omit<
  ProposedClarificationQuestion,
  'answer'
> {
  id: string;
  answer: WorkflowClarificationAnswer;
}
export interface WorkflowClarificationCategory extends Omit<
  ProposedClarificationCategory,
  'questions'
> {
  id: string;
  questions: WorkflowClarificationQuestion[];
}
export interface WorkflowClarificationStatement extends ProposedRequirementStatement {
  id: string;
}
export interface WorkflowClarificationSuggestion extends ProposedWorkflowSuggestion {
  id: string;
}
export interface WorkflowClarificationRound {
  id: string;
  contextFingerprint: string;
  sourceMessages: WorkflowSourceMessage[];
  limits: ClarificationQuestionLimits;
  options: ResolvedWorkflowClarificationOptions;
  statements: WorkflowClarificationStatement[];
  categories: WorkflowClarificationCategory[];
  suggestions?: WorkflowClarificationSuggestion[];
}
export interface CreateWorkflowClarificationRoundInput {
  context: WorkflowPlanningContext;
  limits: ClarificationQuestionLimits;
  options?: WorkflowClarificationOptions;
  proposal: WorkflowRequirementsProposal;
}
export interface WorkflowClarificationRoundInput {
  round: WorkflowClarificationRound;
  context: WorkflowPlanningContext;
}
export type WorkflowClarificationReply =
  | { kind: 'single-choice'; questionId: string; choiceId: string }
  | { kind: 'multiple-choice'; questionId: string; choiceIds: string[] }
  /** Explicit human text may answer any question; it is never converted to a choice ID. */
  | { kind: 'text'; questionId: string; text: string }
  | { kind: 'defer'; questionId: string };
export interface WorkflowAnswerEvidence {
  kind: 'clarification-answer';
  roundId: string;
  questionId: string;
}
export interface WorkflowRequirementFact {
  id: string;
  text: string;
  sources: (WorkflowMessageEvidence | WorkflowAnswerEvidence)[];
}
export interface WorkflowClarificationResolution {
  roundId: string;
  contextFingerprint: string;
  sourceMessages: WorkflowSourceMessage[];
  replies: WorkflowClarificationReply[];
  facts: WorkflowRequirementFact[];
  pendingQuestionIds: string[];
  deferredQuestionIds: string[];
  readyForPlanning: boolean;
  requirementsPrompt: string;
}
export interface ResolveWorkflowClarificationRepliesInput {
  round: WorkflowClarificationRound;
  context: WorkflowPlanningContext;
  replies: WorkflowClarificationReply[];
  previous?: WorkflowClarificationResolution;
}
export interface WorkflowClarificationResolutionInput {
  round: WorkflowClarificationRound;
  replies: WorkflowClarificationReply[];
}
export interface WorkflowRequirementsPromptInput {
  sourceMessages: WorkflowSourceMessage[];
  facts: WorkflowRequirementFact[];
  pendingQuestions: WorkflowClarificationQuestion[];
  deferredQuestions: WorkflowClarificationQuestion[];
}
export interface IdentifiedClarificationPart {
  id: string;
}
