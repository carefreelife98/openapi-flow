import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  ApiInputRequirement,
  ConfirmedApiInput,
  ReadyWorkflowDraftApiCallBindings,
  WorkflowDraftApiBindingIntent,
  WorkflowDraft,
  WorkflowDraftEditResolution,
  WorkflowDraftEditRepair,
  WorkflowDraftApiInputEditContract,
  WorkflowDraftApiInputEditTarget,
  WorkflowDraftApiInputEditAnswers,
  WorkflowDraftNativeParameterEditContract,
  PrepareWorkflowDraftEditInput,
  AssembledWorkflowDraftEdit,
  WorkflowDraftApiCallBindingResult,
  WorkflowDraftApiCallArgumentsResult,
  WorkflowDraftApiInputEditResult,
  WorkflowDraftApiBindingEditResult,
  WorkflowDraftNativeNodeAdditionResult,
  WorkflowDraftNativeNodeParameterOwnershipResult,
  WorkflowDraftNativeNodeParameterOwnershipContract,
  WorkflowDraftNativeParameterEditTargetsResult,
  WorkflowDraftNativeParameterEditResult,
  WorkflowDraftNativeReferenceRepairResult,
  WorkflowDraftRequirementEditDescription,
  ClarificationQuestionLimits,
  WorkflowDraftClarification,
  WorkflowClarificationQuestion,
  WorkflowDraftEditPlan,
  ResolvedWorkflowDraftClarificationScopes,
  WorkflowDraftConnectionEditResult,
  WorkflowReviewSuggestionLimits,
  PendingWorkflowDraftApiCallBindings,
  WorkflowDraftApiCallPlanningQuestion,
  WorkflowDraftNativeNodeAdditionReadiness,
  ApiRequestMediaTypeDecision,
  ApiInputAnswerContext,
  ApiInputAnswerAnalysis,
  WorkflowDraftNativeDependencies,
  WorkflowDraftTerminalRemoval,
} from '@openapi-flow/core';
import type {
  N8nTemplateContext,
  N8nTemplateDeployment,
  N8nWorkflowTemplateResult,
  ResolveN8nNativeFeaturesInput,
  N8nNativeFeature,
  N8nNativeFeatureContextRequirement,
} from '@openapi-flow/n8n';
import type { draftConversationStateSchema } from '../schemas/workflow-draft-conversation-state-schema.js';
import type { draftConversationResponseSchema } from '../schemas/workflow-draft-conversation-response-schema.js';
import type { z } from 'zod';
import type { draftConversationWorkKindSchema } from '../schemas/workflow-draft-conversation-work-kind-schema.js';
import type { draftConversationOutcomeSchema } from '../schemas/workflow-draft-conversation-outcome-schema.js';

export type WorkflowDraftConversationOutcome = z.infer<
  typeof draftConversationOutcomeSchema
>;

export interface WorkflowDraftConversationDependencies {
  model: BaseChatModel;
  checkpointer: BaseCheckpointSaver;
  context: N8nTemplateContext;
  name: string;
  reviewPolicy: 'review' | 'automatic';
  includeExplanations?: boolean;
  allowRuntimeInputs?: boolean;
  allowRuntimeParameters?: boolean;
  /** A separate producer-choice checkpoint for new native roles; omission preserves existing planning. */
  planNativeDependencies?: boolean;
  /** Select request dependency intent before binding values or asking source questions. */
  planApiBindingInputs?: boolean;
  /** Track scenario-requested optional literals in the existing argument call. */
  trackRequestedApiInputs?: boolean;
  itemMode?: 'linked';
  deployments?: N8nTemplateDeployment[];
  /** Explicit question budgets enable request clarification; no hidden environment defaults. */
  clarification?: WorkflowDraftConversationClarificationOptions;
  /** Fresh optional follow-ups at every human review/question boundary. */
  reviewSuggestions?: WorkflowDraftConversationReviewSuggestionOptions;
  /** Opt in to stable OSS feature definitions; context.capabilities remain explicit extensions. */
  nativeFeatures?: WorkflowDraftConversationNativeFeatureOptions;
}
export interface WorkflowDraftConversationEditInput extends Omit<
  PrepareWorkflowDraftEditInput,
  'context'
> {
  context: N8nTemplateContext;
}
export type WorkflowDraftConversationNativeFeatureOptions = Pick<
  ResolveN8nNativeFeaturesInput,
  'features' | 'jsonOutput'
>;
export interface WorkflowDraftConversationNativeFeature {
  feature: N8nNativeFeature;
  status: 'ready' | 'requires-context';
  planningAvailable: boolean;
  missingContext: N8nNativeFeatureContextRequirement[];
}
export interface ResolvedWorkflowDraftConversationNativeFeatures {
  dependencies: WorkflowDraftConversationDependencies;
  inventory?: WorkflowDraftConversationNativeFeature[];
}
export interface WorkflowDraftConversationReviewSuggestionOptions {
  limits: WorkflowReviewSuggestionLimits;
  includeExtensions?: boolean;
}
export interface WorkflowDraftConversationClarificationOptions {
  limits: ClarificationQuestionLimits;
  includeSuggestions?: boolean;
}
export interface WorkflowDraftConversationClarificationHistory {
  clarification: WorkflowDraftClarification;
  plan?: WorkflowDraftEditPlan;
  clarificationScopes?: ResolvedWorkflowDraftClarificationScopes;
  connectionResult?: WorkflowDraftConnectionEditResult;
  structuralConnectionResult?: WorkflowDraftTerminalRemoval;
  candidate?: WorkflowDraftConversationCandidate;
  resolutions: WorkflowDraftEditResolution[];
  repairs: WorkflowDraftEditRepair[];
  stageResults: Record<string, WorkflowDraftConversationStageResult>;
  reason: 'requirements-changed' | 'request-superseded' | 'next-turn';
}
export interface WorkflowDraftConversationClarificationEvidence {
  inactiveMessageIds: string[];
  requestMessageIds: string[];
}

export interface WorkflowDraftConversationInputAnswerExtraction {
  messageId: string;
  token: string;
  context: ApiInputAnswerContext;
  analysis: ApiInputAnswerAnalysis;
}
/** Private typed submissions, not synthetic natural-language evidence. */
export interface WorkflowDraftConversationApiInputEditAnswerSubmission {
  messageId: string;
  stepId: string;
  confirmedAnswers: WorkflowDraftApiInputEditAnswers;
}
/** Read-only copies of the original planning records shown with an enabled explanation view. */
export interface WorkflowDraftConversationPlanningResults {
  plan?: WorkflowDraftEditPlan;
  stageResults: Record<string, WorkflowDraftConversationStageResult>;
  connectionResult?: WorkflowDraftConnectionEditResult;
  structuralConnectionResult?: WorkflowDraftTerminalRemoval;
  inputAnswerHistory: WorkflowDraftConversationInputAnswerExtraction[];
}
export interface WorkflowDraftConversationRequest {
  id: string;
  text: string;
  expectedRevision: number;
}
export interface WorkflowDraftConversationInput {
  request: WorkflowDraftConversationRequest;
  /** Required on the first invocation only. A deliberately empty canonical draft is supported. */
  initialDraft?: WorkflowDraft;
}
export type WorkflowDraftConversationWorkKind = z.infer<
  typeof draftConversationWorkKindSchema
>;
export interface WorkflowDraftConversationWork {
  key: string;
  kind: WorkflowDraftConversationWorkKind;
  stepId?: string;
  taskId?: string;
}
export interface WorkflowDraftConversationBundle {
  stepId: string;
  /** The actual planning snapshot, not a rewritten receipt after other independent work. */
  resolutions: WorkflowDraftEditResolution[];
  repairs: WorkflowDraftEditRepair[];
  mediaSelected?: true;
  inputIntent?: WorkflowDraftApiBindingIntent;
  requestMediaType?: string;
  bindingPlan?: ReadyWorkflowDraftApiCallBindings;
  bindingQuestionPlan?: PendingWorkflowDraftApiCallBindings;
  confirmedInputs?: ConfirmedApiInput[];
  apiInputContract?: WorkflowDraftApiInputEditContract;
  nativeContract?: WorkflowDraftNativeParameterEditContract;
  nativeAdditionOwnership?: WorkflowDraftNativeNodeParameterOwnershipContract;
}
export interface WorkflowDraftConversationQuestion {
  id: string;
  kind:
    | 'message'
    | 'api-input'
    | 'api-input-edit'
    | 'api-binding'
    | 'requirement'
    | 'clarification'
    | 'native-materials';
  message: string;
  stepId?: string;
  taskId?: string;
  requirement?: ApiInputRequirement;
  apiInputEditTarget?: WorkflowDraftApiInputEditTarget;
  apiInputEditContractId?: WorkflowDraftApiInputEditContract['id'];
  requirementEdit?: WorkflowDraftRequirementEditDescription;
  clarificationQuestion?: WorkflowClarificationQuestion;
  bindingQuestion?: WorkflowDraftApiCallPlanningQuestion;
  nativeMaterialReadiness?: WorkflowDraftNativeNodeAdditionReadiness;
}
export interface WorkflowDraftConversationReview {
  phase: 'selection' | 'candidate';
  token: string;
  baseRevision: number;
  planId: string;
}
export interface WorkflowDraftConversationEvent {
  kind:
    | 'request'
    | 'plan'
    | 'planning-stage'
    | 'input-answer'
    | 'api-input-edit-answer'
    | 'binding-answer'
    | 'requirement-answer'
    | 'review'
    | 'superseded'
    | 'adopted'
    | 'exported'
    | 'no-workflow'
    | 'unchanged'
    | 'cancelled'
    | 'clarification-round'
    | 'clarification-answer'
    | 'clarification-revision'
    | 'clarification-scopes'
    | 'review-suggestions'
    | 'suggestion-adopted';
  id: string;
}
export type WorkflowDraftConversationState =
  typeof draftConversationStateSchema.State;
export type WorkflowDraftConversationUpdate =
  typeof draftConversationStateSchema.Update;
export type WorkflowDraftConversationResponse = z.infer<
  typeof draftConversationResponseSchema
>;
export interface PreparedDraftConversationInput {
  input: WorkflowDraftConversationEditInput;
  bundle: WorkflowDraftConversationBundle;
}
export interface WorkflowDraftConversationCandidate {
  result: AssembledWorkflowDraftEdit;
  preview?: N8nWorkflowTemplateResult;
}
export type WorkflowDraftConversationStageResult =
  | {
      kind: 'native-dependencies';
      dependencies: WorkflowDraftNativeDependencies;
    }
  | {
      kind: 'request-media';
      decision: ApiRequestMediaTypeDecision;
      requestMediaType?: string;
    }
  | WorkflowDraftApiCallBindingResult
  | { kind: 'api-binding-intent'; inputIntent: WorkflowDraftApiBindingIntent }
  | WorkflowDraftApiCallArgumentsResult
  | WorkflowDraftApiInputEditContract
  | WorkflowDraftApiInputEditResult
  | WorkflowDraftApiBindingEditResult
  | WorkflowDraftNativeNodeAdditionResult
  | WorkflowDraftNativeNodeParameterOwnershipResult
  | WorkflowDraftNativeParameterEditTargetsResult
  | WorkflowDraftNativeParameterEditResult
  | WorkflowDraftNativeReferenceRepairResult
  | WorkflowDraftConversationRequirementAnswer;
export interface WorkflowDraftConversationRequirementAnswer {
  kind: 'requirement-answer';
  sourceMessageId: string;
  resolution: WorkflowDraftConversationRequirementResolution;
}
export type WorkflowDraftConversationRequirementResolution = Extract<
  WorkflowDraftEditResolution,
  { kind: 'requirement' }
>;
