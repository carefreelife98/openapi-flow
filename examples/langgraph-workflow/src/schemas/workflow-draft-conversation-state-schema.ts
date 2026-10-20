import { StateSchema } from '@langchain/langgraph';
import { z } from 'zod';
import { draftConversationOutcomeSchema } from './workflow-draft-conversation-outcome-schema.js';
import type {
  WorkflowDraft,
  WorkflowSourceMessage,
  WorkflowDraftEditPlan,
  WorkflowDraftEditResolution,
  WorkflowDraftEditRepair,
  WorkflowDraftApiCallArgumentsResult,
  WorkflowDraftConnectionEditResult,
  WorkflowDraftClarification,
  ResolvedWorkflowDraftClarificationScopes,
  WorkflowReviewSuggestions,
  WorkflowReviewSuggestionAdoption,
  WorkflowClarificationAnswerRevision,
  WorkflowDraftNativeDependencies,
  WorkflowDraftTerminalRemoval,
} from '@openapi-flow/core';
import type { N8nWorkflowTemplateResult } from '@openapi-flow/n8n';
import type {
  WorkflowDraftConversationInput,
  WorkflowDraftConversationWork,
  WorkflowDraftConversationBundle,
  WorkflowDraftConversationQuestion,
  WorkflowDraftConversationReview,
  WorkflowDraftConversationEvent,
  WorkflowDraftConversationCandidate,
  WorkflowDraftConversationResponse,
  WorkflowDraftConversationStageResult,
  WorkflowDraftConversationClarificationHistory,
  WorkflowDraftConversationNativeFeature,
  WorkflowDraftConversationInputAnswerExtraction,
} from '../types/workflow-draft-conversation.js';

export const draftConversationInputSchema = new StateSchema({
  input: z.custom<WorkflowDraftConversationInput>(),
});
export const draftConversationStateSchema = new StateSchema({
  ...draftConversationInputSchema.fields,
  draft: z.custom<WorkflowDraft>().optional(),
  nativeFeatures: z
    .custom<WorkflowDraftConversationNativeFeature[]>()
    .optional(),
  messages: z.custom<WorkflowSourceMessage[]>().optional(),
  turnMessages: z.custom<WorkflowSourceMessage[]>().optional(),
  requestMessageIds: z.array(z.string()).optional(),
  turnRequestMessageIds: z.array(z.string()).optional(),
  clarification: z.custom<WorkflowDraftClarification>().optional(),
  clarificationScopes: z
    .custom<ResolvedWorkflowDraftClarificationScopes>()
    .optional(),
  clarificationHistory: z
    .custom<WorkflowDraftConversationClarificationHistory[]>()
    .optional(),
  clarificationAnswerRevisions: z
    .custom<WorkflowClarificationAnswerRevision[]>()
    .optional(),
  inactiveClarificationMessageIds: z.array(z.string()).optional(),
  clarificationResponseMessageIds: z.array(z.string()).optional(),
  requestIds: z.array(z.string()).optional(),
  plan: z.custom<WorkflowDraftEditPlan>().optional(),
  nativeDependencies: z.custom<WorkflowDraftNativeDependencies>().optional(),
  resolutions: z.custom<WorkflowDraftEditResolution[]>().optional(),
  repairs: z.custom<WorkflowDraftEditRepair[]>().optional(),
  bundles: z.custom<WorkflowDraftConversationBundle[]>().optional(),
  attempted: z.array(z.string()).optional(),
  stageResults: z
    .record(z.string(), z.custom<WorkflowDraftConversationStageResult>())
    .optional(),
  questions: z.custom<WorkflowDraftConversationQuestion[]>().optional(),
  apiArgumentResults: z
    .record(z.string(), z.custom<WorkflowDraftApiCallArgumentsResult>())
    .optional(),
  work: z.custom<WorkflowDraftConversationWork>().optional(),
  candidate: z.custom<WorkflowDraftConversationCandidate>().optional(),
  connectionResult: z.custom<WorkflowDraftConnectionEditResult>().optional(),
  structuralConnectionResult: z
    .custom<WorkflowDraftTerminalRemoval>()
    .optional(),
  review: z.custom<WorkflowDraftConversationReview>().optional(),
  reviewSuggestions: z.custom<WorkflowReviewSuggestions>().optional(),
  reviewSuggestionHistory: z.custom<WorkflowReviewSuggestions[]>().optional(),
  suggestionAdoptions: z
    .custom<WorkflowReviewSuggestionAdoption[]>()
    .optional(),
  response: z.custom<WorkflowDraftConversationResponse>().optional(),
  inputAnswerExtraction: z
    .custom<WorkflowDraftConversationInputAnswerExtraction>()
    .optional(),
  inputAnswerHistory: z
    .array(z.custom<WorkflowDraftConversationInputAnswerExtraction>())
    .optional(),
  issues: z.array(z.string()).optional(),
  selectionApproved: z.boolean().optional(),
  candidateApproved: z.boolean().optional(),
  events: z.custom<WorkflowDraftConversationEvent[]>().optional(),
  artifact: z.custom<N8nWorkflowTemplateResult>().optional(),
  outcome: draftConversationOutcomeSchema.optional(),
  phase: z
    .enum([
      'analyzing',
      'clarifying',
      'clarification-questions',
      'scoping',
      'selecting',
      'planning',
      'questions',
      'connections',
      'candidate',
      'adopting',
      'exporting',
      'complete',
      'no-workflow',
      'cancelled',
    ])
    .optional(),
});
